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
import { IncidentService } from './incident.service.js';
import { ReschedulingService } from './rescheduling.service.js';
import { IncidentEvidenceService } from './incident-evidence.service.js';
import { EventEvidenceService } from './event-evidence.service.js';
import { RescheduleProposalService } from './reschedule-proposal.service.js';
import { ProposalPushService } from './proposal-push.service.js';

function incidentText(value: unknown, max: number, optional = false): string | undefined {
  if (optional && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException('Datos de incidencia inválidos');
  return value.trim();
}

@Controller('shipments')
@UseGuards(OperationalUserGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService, private readonly reads: ShipmentsReadService, private readonly assignments: AssignmentService, private readonly statuses: StatusService, private readonly custody: CustodyService, private readonly planning: PlanningService, private readonly incidents: IncidentService, private readonly rescheduling: ReschedulingService, private readonly incidentEvidence: IncidentEvidenceService, private readonly eventEvidence: EventEvidenceService, private readonly proposals: RescheduleProposalService, private readonly proposalPush: ProposalPushService) {}

  @Post('push-devices')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  registerPushDevice(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 || typeof (body as { token?: unknown }).token !== 'string' || !/^(Expo(nent)?PushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test((body as { token: string }).token) || typeof (body as { expiresAt?: unknown }).expiresAt !== 'number' || !Number.isSafeInteger((body as { expiresAt: number }).expiresAt)) throw new BadRequestException('Dispositivo invalido');
    const expires = (body as { expiresAt: number }).expiresAt;
    if (expires <= Date.now()) throw new BadRequestException('Sesion vencida');
    return this.proposalPush.register(request.currentUser!.id, (body as { token: string }).token, new Date(Math.min(expires, Date.now() + 86400000)));
  }

  @Post('push-devices/deactivate')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  deactivatePushDevice(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { token?: unknown }).token !== 'string' || !/^(Expo(nent)?PushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test((body as { token: string }).token)) throw new BadRequestException('Dispositivo invalido');
    return this.proposalPush.deactivate(request.currentUser!.id, (body as { token: string }).token);
  }

  @Get('reschedule-proposals/pending')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  pendingProposals(@Req() request: OperationalUserRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Consulta inválida');
    return this.proposals.pending(request.currentUser!.id, Number(query.page ?? 1));
  }

  @Get(':id/incidents/:incidentId/evidence')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  listIncidentEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('incidentId') incidentId: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Consulta inválida');
    return this.incidentEvidence.list(request.currentUser!.id, id, incidentId, Number(query.page ?? 1));
  }

  @Get(':id/incidents/:incidentId/evidence/:evidenceId')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  readIncidentEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('incidentId') incidentId: string, @Param('evidenceId') evidenceId: string) {
    return this.incidentEvidence.read(request.currentUser!.id, id, incidentId, evidenceId);
  }

  @Post(':id/incidents/:incidentId/evidence')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  addIncidentEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('incidentId') incidentId: string, @Headers('idempotency-key') key: string | undefined, @UploadedFile() file?: ReceiptFile) {
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('Identificador de operación inválido');
    const evidence = parseReceipt(file);
    if (!evidence) throw new BadRequestException('Seleccioná una evidencia.');
    return this.incidentEvidence.add(request.currentUser!.id, id, incidentId, key, evidence);
  }

  @Get(':id/events/:eventId/evidence')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  listEventEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('eventId') eventId: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Consulta inválida');
    return this.eventEvidence.list(request.currentUser!.id, id, eventId, Number(query.page ?? 1));
  }

  @Get(':id/events/:eventId/evidence/:evidenceId')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  readEventEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('eventId') eventId: string, @Param('evidenceId') evidenceId: string) {
    return this.eventEvidence.read(request.currentUser!.id, id, eventId, evidenceId);
  }

  @Post(':id/events/:eventId/evidence')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  addEventEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('eventId') eventId: string, @Headers('idempotency-key') key: string | undefined, @UploadedFile() file?: ReceiptFile) {
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('Identificador de operación inválido');
    const evidence = parseReceipt(file);
    if (!evidence) throw new BadRequestException('Seleccioná una evidencia.');
    return this.eventEvidence.add(request.currentUser!.id, id, eventId, key, evidence);
  }

  @Get(':id/reschedule-proposals')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  proposalList(@Req() request: OperationalUserRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Consulta invalida');
    return this.proposals.list(request.currentUser!.id, id, Number(query.page ?? 1));
  }

  @Post(':id/reschedule-proposals')
  @RequireRoles('COURIER')
  @Header('Cache-Control', 'no-store')
  proposalCreate(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Propuesta invalida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['requestKey', 'date', 'windowStart', 'windowEnd', 'reason', 'nextAction', 'incidentId'].includes(key)) || typeof input.requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey) || typeof input.date !== 'string' || (input.windowStart !== undefined && typeof input.windowStart !== 'string') || (input.windowEnd !== undefined && typeof input.windowEnd !== 'string')) throw new BadRequestException('Propuesta invalida');
    return this.proposals.create(request.currentUser!.id, id, { requestKey: input.requestKey, date: input.date, windowStart: input.windowStart as string | undefined, windowEnd: input.windowEnd as string | undefined, reason: incidentText(input.reason, 500)!, nextAction: incidentText(input.nextAction, 500)!, incidentId: incidentText(input.incidentId, 128, true) });
  }

  @Post(':id/reschedule-proposals/:proposalId/reject')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  proposalReject(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('proposalId') proposalId: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'notes')) throw new BadRequestException('Rechazo invalido');
    return this.proposals.reject(request.currentUser!.id, id, proposalId, incidentText((body as Record<string, unknown>).notes, 500)!);
  }

  @Get(':id/rescheduling')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  reschedulingDetails(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    return this.rescheduling.get(request.currentUser!.id, id);
  }

  @Post(':id/rescheduling')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  reschedule(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Reprogramación inválida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['date', 'windowStart', 'windowEnd', 'reason', 'nextAction', 'observation', 'incidentId', 'proposalId', 'keepAssignment', 'expectedUpdatedAt'].includes(key)) || typeof input.keepAssignment !== 'boolean' || typeof input.expectedUpdatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.expectedUpdatedAt) || typeof input.date !== 'string' || (input.windowStart !== undefined && typeof input.windowStart !== 'string') || (input.windowEnd !== undefined && typeof input.windowEnd !== 'string')) throw new BadRequestException('Reprogramación inválida');
    return this.rescheduling.reschedule(request.currentUser!.id, id, { date: input.date, windowStart: input.windowStart as string | undefined, windowEnd: input.windowEnd as string | undefined, reason: incidentText(input.reason, 500)!, nextAction: incidentText(input.nextAction, 500)!, observation: incidentText(input.observation, 1000, true), incidentId: incidentText(input.incidentId, 128, true), proposalId: incidentText(input.proposalId, 128, true), keepAssignment: input.keepAssignment, expectedUpdatedAt: input.expectedUpdatedAt });
  }

  @Get(':id/incidents')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  listIncidents(@Req() request: OperationalUserRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => key !== 'page') || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page)))) throw new BadRequestException('Consulta inválida');
    return this.incidents.list(request.currentUser!.id, id, Number(query.page ?? 1));
  }

  @Post(':id/incidents')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  createIncident(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Incidencia inválida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['requestKey', 'phase', 'kind', 'description', 'nextAction', 'failedAttempt'].includes(key)) || typeof input.requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey) || !['PICKUP', 'TRANSIT', 'DELIVERY', 'REVIEW'].includes(input.phase as string) || (input.failedAttempt !== undefined && typeof input.failedAttempt !== 'boolean') || (input.failedAttempt === true && !['PICKUP', 'DELIVERY'].includes(input.phase as string))) throw new BadRequestException('Incidencia inválida');
    return this.incidents.create(request.currentUser!.id, id, { requestKey: input.requestKey, phase: input.phase as string, failedAttempt: input.failedAttempt === true, kind: incidentText(input.kind, 120)!, description: incidentText(input.description, 1000)!, nextAction: incidentText(input.nextAction, 1000, true) });
  }

  @Post(':id/incidents/:incidentId/resolve')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  resolveIncident(@Req() request: OperationalUserRequest, @Param('id') id: string, @Param('incidentId') incidentId: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Resolución inválida');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['description', 'nextAction'].includes(key))) throw new BadRequestException('Resolución inválida');
    return this.incidents.resolve(request.currentUser!.id, id, incidentId, incidentText(input.description, 1000)!, incidentText(input.nextAction, 1000, true));
  }

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

  @Post(':id/pickup')
  @RequireRoles('COURIER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 4096 } }))
  pickup(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown, @UploadedFile() file?: ReceiptFile) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Retiro inválido');
    let input = body as Record<string, unknown>;
    if ('payload' in input) { if (Object.keys(input).length !== 1 || typeof input.payload !== 'string') throw new BadRequestException('Retiro inválido'); try { input = JSON.parse(input.payload); } catch { throw new BadRequestException('Retiro inválido'); } }
    else if (file) throw new BadRequestException('Retiro inválido');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => key !== 'observation') || (input.observation !== undefined && (typeof input.observation !== 'string' || input.observation.length > 1000))) throw new BadRequestException('Retiro inválido');
    return this.statuses.pickup(request.currentUser!.id, id, input.observation as string | undefined, parseReceipt(file));
  }

  @Post(':id/delivery')
  @RequireRoles('COURIER')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 4096 } }))
  delivery(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown, @UploadedFile() file?: ReceiptFile) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Entrega inválida');
    let input = body as Record<string, unknown>;
    if ('payload' in input) { if (Object.keys(input).length !== 1 || typeof input.payload !== 'string') throw new BadRequestException('Entrega inválida'); try { input = JSON.parse(input.payload); } catch { throw new BadRequestException('Entrega inválida'); } }
    else if (file) throw new BadRequestException('Entrega inválida');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Entrega inválida');
    if (Object.keys(input).some((key) => !['receiver', 'observation', 'relationship'].includes(key)) || typeof input.receiver !== 'string' || !input.receiver.trim() || input.receiver.length > 120 || (input.observation !== undefined && (typeof input.observation !== 'string' || input.observation.length > 1000)) || (input.relationship !== undefined && (typeof input.relationship !== 'string' || input.relationship.length > 120))) throw new BadRequestException('Indicá quién recibió el envío.');
    return this.statuses.deliver(request.currentUser!.id, id, input.receiver, input.observation as string | undefined, input.relationship as string | undefined, parseReceipt(file));
  }

  @Get(':id/delivery/evidence')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  deliveryEvidence(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    return this.statuses.deliveryEvidence(request.currentUser!.id, id);
  }

  @Patch(':id/status')
  @RequireRoles('ADMIN', 'COURIER')
  @Header('Cache-Control', 'no-store')
  setStatus(@Req() request: OperationalUserRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Estado inválido');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['status', 'expectedStatus', 'observation'].includes(key)) || !['IN_ROUTE', 'IN_DEPOT'].includes(input.status as string) || !['PICKED_UP', 'IN_ROUTE', 'IN_DEPOT', 'RESCHEDULED'].includes(input.expectedStatus as string) || (input.observation !== undefined && (typeof input.observation !== 'string' || input.observation.length > 1000))) throw new BadRequestException('Estado inválido');
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
    if (Object.keys(query).some((key) => !['page', 'type'].includes(key)) || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,4}$/.test(query.page))) || (query.type !== undefined && (typeof query.type !== 'string' || !['CREATED', 'STATUS_CHANGED', 'RECEIPT_ADDED', 'RECEIPT_REPLACED', 'ASSIGNMENT_CHANGED', 'CUSTODY_CHANGED', 'PLAN_CHANGED', 'INCIDENT_RECORDED', 'INCIDENT_RESOLVED', 'INCIDENT_EVIDENCE_ADDED', 'EVENT_EVIDENCE_ADDED', 'RESCHEDULED', 'RESCHEDULE_PROPOSED', 'RESCHEDULE_PROPOSAL_REJECTED'].includes(query.type)))) throw new BadRequestException('Consulta inválida');
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
