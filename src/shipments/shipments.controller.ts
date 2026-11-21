import { BadRequestException, Body, Controller, Get, Header, Headers, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OperationalUserGuard } from '../users/operational-user.guard.js';
import { RequireRoles } from '../users/require-roles.decorator.js';
import { RolesGuard } from '../users/roles.guard.js';
import type { OperationalUserRequest } from '../users/users.types.js';
import { parseShipmentInput } from './shipment-input.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentsReadService } from './shipments-read.service.js';
import { parseShipmentQuery } from './shipment-query.js';
import { parseReceipt, type ReceiptFile } from './receipt-input.js';
import { AssignmentService } from './assignment.service.js';
import { StatusService } from './status.service.js';
import { CustodyService } from './custody.service.js';
import { PlanningService, parsePlanningDate } from './planning.service.js';

@Controller('shipments')
@UseGuards(OperationalUserGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService, private readonly reads: ShipmentsReadService, private readonly assignments: AssignmentService, private readonly statuses: StatusService, private readonly custody: CustodyService, private readonly planning: PlanningService) {}

  @Get()
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR', 'COURIER')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    return this.reads.list(request.currentUser!, parseShipmentQuery(query));
  }

  @Get('tasks/mine')
  @RequireRoles('COURIER')
  @Header('Cache-Control', 'no-store')
  myTasks(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'date')) throw new BadRequestException('Consulta inválida');
    return this.planning.tasks(request.currentUser!.id, parsePlanningDate(query.date));
  }

  @Get('planning/day')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  planningDay(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['date', 'page', 'search'].includes(key)) || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page))) || (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 120))) throw new BadRequestException('Consulta inválida');
    return this.planning.get(request.currentUser!.id, parsePlanningDate(query.date), Number(query.page ?? 1), typeof query.search === 'string' ? query.search.trim() : '');
  }

  @Post('planning/day')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  confirmPlanning(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Planificación inválida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || !Array.isArray(input.entries) || !input.entries.length || input.entries.length > 50) throw new BadRequestException('Planificación inválida');
    const ids = new Set<string>();
    const validId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 128;
    const entries = input.entries.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Planificación inválida');
      const row = item as Record<string, unknown>;
      if (Object.keys(row).length !== 4 || !validId(row.id) || !validId(row.courierId) || !(row.expectedCourierId === null || validId(row.expectedCourierId)) || !(row.expectedPlannedFor === null || typeof row.expectedPlannedFor === 'string') || ids.has(row.id)) throw new BadRequestException('Planificación inválida');
      if (row.expectedPlannedFor !== null) parsePlanningDate(row.expectedPlannedFor);
      ids.add(row.id);
      return { id: row.id, courierId: row.courierId, expectedCourierId: row.expectedCourierId as string | null, expectedPlannedFor: row.expectedPlannedFor as string | null };
    });
    return this.planning.confirm(request.currentUser!.id, parsePlanningDate(input.date), entries);
  }

  @Get('custody/mine')
  @RequireRoles('COURIER')
  @Header('Cache-Control', 'no-store')
  myCustody(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Invalid page');
    return this.custody.mine(request.currentUser!.id, Number(query.page ?? 1));
  }

  @Get('by-code/:code')
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR', 'COURIER')
  @Header('Cache-Control', 'no-store')
  byCode(@Req() request: OperationalUserRequest, @Param('code') code: string) {
    if (!/^OH-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(code)) throw new BadRequestException('Código inválido');
    return this.reads.getByCode(request.currentUser!, code);
  }

  @Get(':id')
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR', 'COURIER')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    return this.reads.get(request.currentUser!, id);
  }

  @Patch(':id/assignment')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  assign(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Asignación inválida');
    const input = body as Record<string, unknown>;
    const validId = (value: unknown) => value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= 128);
    if (Object.keys(input).length !== 2 || !validId(input.courierId) || !validId(input.expectedCourierId)) throw new BadRequestException('Asignación inválida');
    return this.assignments.set(request.currentUser!.id, id, input.courierId as string | null, input.expectedCourierId as string | null);
  }

  @Patch(':id/cancel')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  cancel(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Cancelación inválida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || !['PENDING', 'ASSIGNED'].includes(input.expectedStatus as string) || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new BadRequestException('Indicá un motivo válido');
    return this.statuses.cancel(request.currentUser!.id, id, input.expectedStatus as string, input.reason);
  }

  @Patch(':id/status')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  setStatus(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Estado inválido');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['status', 'expectedStatus', 'observation'].includes(key)) || !['IN_ROUTE', 'IN_DEPOT'].includes(input.status as string) || !['PICKED_UP', 'IN_ROUTE', 'IN_DEPOT'].includes(input.expectedStatus as string) || (input.observation !== undefined && (typeof input.observation !== 'string' || input.observation.length > 1000))) throw new BadRequestException('Estado inválido');
    return this.statuses.set(request.currentUser!.id, id, input.expectedStatus as string, input.status as 'IN_ROUTE' | 'IN_DEPOT', input.observation as string | undefined);
  }

  @Get(':id/custody')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  getCustody(@Req() request: OperationalUserRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'search') || (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 120))) throw new BadRequestException('Invalid search');
    return this.custody.get(request.currentUser!.id, id, typeof query.search === 'string' ? query.search.trim() : '');
  }

  @Patch(':id/custody')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 4096 } }))
  transferCustody(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown, @UploadedFile() file?: ReceiptFile) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid custody');
    let input = body as Record<string, unknown>;
    if ('payload' in input) { if (Object.keys(input).length !== 1 || typeof input.payload !== 'string') throw new BadRequestException('Invalid custody'); try { input = JSON.parse(input.payload); } catch { throw new BadRequestException('Invalid custody'); } }
    else if (file) throw new BadRequestException('Invalid custody');
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 || (input.observation !== undefined && (typeof input.observation !== 'string' || input.observation.length > 1000))) throw new BadRequestException('Invalid custody');
    const observation = input.observation as string | undefined;
    const evidence = parseReceipt(file);
    if (input.kind === 'COURIER' && Object.keys(input).every((key) => ['expectedVersion', 'kind', 'courierId', 'observation'].includes(key)) && typeof input.courierId === 'string' && input.courierId.trim().length > 0 && input.courierId.length <= 128) return this.custody.transfer(request.currentUser!.id, id, { expectedVersion: input.expectedVersion as number, kind: 'COURIER', courierId: input.courierId, observation }, evidence);
    if (input.kind === 'DEPOT' && Object.keys(input).every((key) => ['expectedVersion', 'kind', 'location', 'observation'].includes(key)) && typeof input.location === 'string' && input.location.trim().length > 0 && input.location.length <= 120) return this.custody.transfer(request.currentUser!.id, id, { expectedVersion: input.expectedVersion as number, kind: 'DEPOT', location: input.location.trim(), observation }, evidence);
    throw new BadRequestException('Invalid custody');
  }

  @Get(':id/custody/evidence/:eventId')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  getCustodyEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('eventId') eventId: string) {
    return this.custody.evidence(request.currentUser!.id, id, eventId);
  }

  @Get(':id/receipt')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async receipt(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    const file = await this.reads.receipt(request.currentUser!, id);
    return new StreamableFile(Buffer.from(file.data), { type: file.mediaType, disposition: 'attachment; filename="comprobante"' });
  }

  @Get(':id/label')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  async label(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    const shipment = await this.reads.get(request.currentUser!, id);
    if (!/^OH-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(shipment.code) || !shipment.recipientName || !shipment.deliveryStreet || !shipment.deliveryNumber || !shipment.deliveryLocality || !shipment.deliveryDepartment || !shipment.packages.length) throw new BadRequestException('Faltan datos para generar la etiqueta');
    return { code: shipment.code, recipientName: shipment.recipientName, street: shipment.deliveryStreet, number: shipment.deliveryNumber, locality: shipment.deliveryLocality, department: shipment.deliveryDepartment, packageCount: shipment.packages.length };
  }

  @Get(':id/history')
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR')
  @Header('Cache-Control', 'no-store')
  history(@Req() request: OperationalUserRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['page', 'type'].includes(key)) || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page))) || (query.type !== undefined && (typeof query.type !== 'string' || !['CREATED', 'STATUS_CHANGED', 'RECEIPT_ADDED', 'RECEIPT_REPLACED', 'ASSIGNMENT_CHANGED', 'CUSTODY_CHANGED', 'PLAN_CHANGED'].includes(query.type)))) throw new BadRequestException('Consulta inválida');
    return this.reads.history(request.currentUser!, id, Number(query.page ?? 1), typeof query.type === 'string' ? query.type : undefined);
  }

  @Post(':id/receipt')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  attachReceipt(@Req() request: OperationalUserRequest, @Param('id') id: string, @UploadedFile() file?: ReceiptFile) {
    const receipt = parseReceipt(file);
    if (!receipt) throw new BadRequestException('Seleccioná un comprobante.');
    return this.shipments.attachReceipt(request.currentUser!.id, id, receipt);
  }

  @Patch(':id/receipt')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16 } }))
  replaceReceipt(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFile() file?: ReceiptFile) {
    if (Object.keys(body).length !== 1 || typeof body.version !== 'string' || !/^[1-9]\d{0,8}$/.test(body.version)) throw new BadRequestException('Versión inválida');
    const receipt = parseReceipt(file); if (!receipt) throw new BadRequestException('Seleccioná un comprobante.');
    return this.shipments.attachReceipt(request.currentUser!.id, id, receipt, Number(body.version));
  }

  @Post()
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16384 } }))
  create(@Req() request: OperationalUserRequest, @Body() body: unknown, @UploadedFile() file?: ReceiptFile, @Headers('idempotency-key') key?: string) {
    if (key !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('Identificador de operación inválido');
    let input = body;
    if (body && typeof body === 'object' && 'payload' in body) {
      if (Object.keys(body).length !== 1 || typeof body.payload !== 'string') throw new BadRequestException('Datos de envío inválidos');
      try { input = JSON.parse(body.payload); } catch { throw new BadRequestException('Datos de envío inválidos'); }
    } else if (file) throw new BadRequestException('Datos de envío inválidos');
    return this.shipments.create(request.currentUser!.id, parseShipmentInput(input), parseReceipt(file), key);
  }
}
