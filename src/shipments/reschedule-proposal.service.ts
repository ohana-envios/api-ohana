import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { validateRescheduleDate } from './rescheduling.service.js';
type Input = { requestKey: string; date: string; windowStart?: string; windowEnd?: string; reason: string; nextAction: string; incidentId?: string };
@Injectable()
export class RescheduleProposalService {
  constructor(private readonly prisma: PrismaService) {}
  async pending(actorId: string, page: number) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
    const where = { decision: { is: null }, shipment: { is: { status: { notIn: ['DELIVERED', 'CANCELED'] as ('DELIVERED' | 'CANCELED')[] } } } };
    const [items, total] = await Promise.all([
      this.prisma.rescheduleProposal.findMany({ where, select: { id: true, shipmentId: true, actorLabel: true, proposedDate: true, createdAt: true, shipment: { select: { code: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
      this.prisma.rescheduleProposal.count({ where }),
    ]);
    return { items, total, page, totalPages: Math.ceil(total / 20) };
  }
  async list(actorId: string, shipmentId: string, page: number) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, ...(actor.role === 'COURIER' ? { assignedCourier: { is: { userId: actorId, active: true } } } : {}) }, select: { id: true } });
    if (!shipment) throw new NotFoundException('Envío no encontrado');
    const where = { shipmentId, ...(actor.role === 'COURIER' ? { shipment: { is: { assignedCourier: { is: { userId: actorId, active: true } } } } } : {}) };
    const [items, total] = await Promise.all([this.prisma.rescheduleProposal.findMany({ where, select: { id: true, actorLabel: true, proposedDate: true, windowStart: true, windowEnd: true, reason: true, nextAction: true, incidentId: true, createdAt: true, decision: { select: { approved: true, actorLabel: true, notes: true, createdAt: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }), this.prisma.rescheduleProposal.count({ where })]);
    return { items, page, totalPages: Math.ceil(total / 20) };
  }
  async create(actorId: string, shipmentId: string, input: Input) {
    const { date, start, end } = validateRescheduleDate(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findFirst({ where: { id: shipmentId, assignedCourier: { is: { userId: actorId, active: true } } }, select: { status: true } });
      if (!shipment) throw new NotFoundException('Envío no encontrado');
      const existing = await tx.rescheduleProposal.findUnique({ where: { requestKey: input.requestKey } });
      if (existing) {
        if (existing.shipmentId !== shipmentId || existing.actorUserId !== actorId || existing.proposedDate.getTime() !== date.getTime() || existing.windowStart !== start || existing.windowEnd !== end || existing.reason !== input.reason || existing.nextAction !== input.nextAction || existing.incidentId !== (input.incidentId ?? null)) throw new ConflictException('Identificador de operación ya utilizado');
        return { id: existing.id };
      }
      if (['DELIVERED', 'CANCELED'].includes(shipment.status)) throw new ConflictException('El envío ya está cerrado');
      if (input.incidentId && !await tx.shipmentIncident.findFirst({ where: { id: input.incidentId, shipmentId }, select: { id: true } })) throw new NotFoundException('Incidencia no encontrada');
      const proposal = await tx.rescheduleProposal.create({ data: { requestKey: input.requestKey, shipmentId, actorUserId: actorId, actorLabel: actor.displayName, proposedDate: date, windowStart: start, windowEnd: end, reason: input.reason, nextAction: input.nextAction, incidentId: input.incidentId } });
      await tx.shipmentEvent.create({ data: { shipmentId, actorUserId: actorId, actorLabel: actor.displayName, type: 'RESCHEDULE_PROPOSED', notes: `Propuesta ${proposal.id}: ${input.date} ${start && end ? `${start}-${end}` : 'sin franja'} | Motivo: ${input.reason} | Próxima acción: ${input.nextAction}` } });
      const devices = await tx.pushDevice.findMany({ where: { enabled: true, validUntil: { gt: new Date() }, user: { is: { enabled: true, role: 'ADMIN' } } }, select: { id: true } });
      if (devices.length) await tx.pushDelivery.createMany({ data: devices.map((device) => ({ proposalId: proposal.id, deviceId: device.id })), skipDuplicates: true });
      return { id: proposal.id };
    });
  }
  async reject(actorId: string, shipmentId: string, proposalId: string, notes: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
      const proposal = await tx.rescheduleProposal.findFirst({ where: { id: proposalId, shipmentId }, include: { decision: true } });
      if (!proposal) throw new NotFoundException('Propuesta no encontrada');
      if (proposal.decision) { if (!proposal.decision.approved && proposal.decision.actorUserId === actorId && proposal.decision.notes === notes) return { rejected: true }; throw new ConflictException('La propuesta ya fue resuelta'); }
      await tx.rescheduleDecision.create({ data: { proposalId, actorUserId: actorId, actorLabel: actor.displayName, approved: false, notes } });
      await tx.shipmentEvent.create({ data: { shipmentId, actorUserId: actorId, actorLabel: actor.displayName, type: 'RESCHEDULE_PROPOSAL_REJECTED', notes: `Propuesta ${proposalId} rechazada: ${notes}` } });
      return { rejected: true };
    });
  }
}
