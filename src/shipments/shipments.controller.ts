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

@Controller('shipments')
@UseGuards(OperationalUserGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService, private readonly reads: ShipmentsReadService, private readonly assignments: AssignmentService) {}

  @Get()
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR', 'COURIER')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    return this.reads.list(request.currentUser!, parseShipmentQuery(query));
  }

  @Get('by-code/:code')
  @RequireRoles('ADMIN', 'CUSTOMER', 'OPERATOR', 'COURIER')
  @Header('Cache-Control', 'no-store')
  byCode(@Req() request: OperationalUserRequest, @Param('code') code: string) {
    if (!/^OH-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) throw new BadRequestException('Código inválido');
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

  @Get(':id/receipt')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async receipt(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    const file = await this.reads.receipt(request.currentUser!, id);
    return new StreamableFile(Buffer.from(file.data), { type: file.mediaType, disposition: 'attachment; filename="comprobante"' });
  }

  @Get(':id/history')
  @RequireRoles('ADMIN', 'CUSTOMER')
  @Header('Cache-Control', 'no-store')
  history(@Req() request: OperationalUserRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Página inválida');
    return this.reads.history(request.currentUser!, id, Number(query.page ?? 1));
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
