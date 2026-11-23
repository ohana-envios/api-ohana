import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parsePlanningDate } from './planning.service.js';

type Input = { date: string; windowStart?: string; windowEnd?: string; reason: string; nextAction: string; observation?: string; incidentId?: string; keepAssignment: boolean; expectedUpdatedAt: string; proposalId?: string };

export function validateRescheduleDate(input: { date: string; windowStart?: string; windowEnd?: string }) {
    const date = parsePlanningDate(input.date);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (input.date < today) throw new BadRequestException('La fecha no puede ser anterior a hoy.');
    const start = input.windowStart || null; const end = input.windowEnd || null;
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if ((start === null) !== (end === null) || (start && end && (!validTime(start) || !validTime(end) || start >= end))) throw new BadRequestException('Franja horaria inv\u00e1lida.');
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    if (input.date === today && end && end <= now) throw new BadRequestException('La franja horaria ya termin\u00f3.');
    return { date, start, end };
}

@Injectable()
export class ReschedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actorId: string, id: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
    if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, select: { status: true, plannedFor: true, plannedWindowStart: true, plannedWindowEnd: true, updatedAt: true, custody: true, custodyLocation: true, custodyCourier: { select: { displayName: true } }, assignedCourier: { select: { id: true, displayName: true, active: true } }, incidents: { select: { id: true, kind: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 } } });
    if (!shipment) throw new NotFoundException('Envío no encontrado');
    return shipment;
  }

  async reschedule(actorId: string, id: string, input: Input) {
    const { date, start, end } = validateRescheduleDate(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, plannedFor: true, plannedWindowStart: true, plannedWindowEnd: true, updatedAt: true, custody: true, custodyCourierId: true, custodyLocation: true, assignedCourierId: true, assignedCourier: { select: { displayName: true, active: true } } } });
      if (!shipment) throw new NotFoundException('Envío no encontrado');
      if (shipment.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ConflictException('El envío cambió. Recargá sus datos.');
      if (['DELIVERED', 'CANCELED'].includes(shipment.status)) throw new ConflictException('El envío está cerrado.');
      if (!shipment.custody || !['SENDER', 'COURIER', 'DEPOT'].includes(shipment.custody) || (shipment.custody === 'COURIER' && !shipment.custodyCourierId) || (shipment.custody === 'DEPOT' && !shipment.custodyLocation)) throw new ConflictException('Es necesario conocer la custodia antes de reprogramar.');
      if (input.keepAssignment && (!shipment.assignedCourierId || !shipment.assignedCourier?.active)) throw new ConflictException('No hay un repartidor activo para conservar.');
      if (input.incidentId && !await tx.shipmentIncident.findFirst({ where: { id: input.incidentId, shipmentId: id }, select: { id: true } })) throw new BadRequestException('La incidencia no corresponde al envío.');
      if (input.proposalId) {
        const proposal = await tx.rescheduleProposal.findFirst({ where: { id: input.proposalId, shipmentId: id }, include: { decision: true } });
        if (!proposal || proposal.decision) throw new ConflictException('La propuesta ya fue resuelta o no corresponde al env\u00edo.');
        await tx.rescheduleDecision.create({ data: { proposalId: proposal.id, actorUserId: actorId, actorLabel: actor.displayName, approved: true } });
      }
      const previousDate = shipment.plannedFor?.toISOString().slice(0, 10) ?? 'sin fecha';
      const assignment = input.keepAssignment ? shipment.assignedCourierId : null;
      await tx.shipment.update({ where: { id }, data: { plannedFor: date, plannedWindowStart: start, plannedWindowEnd: end, assignedCourierId: assignment, status: 'RESCHEDULED', updatedAt: new Date(Math.max(Date.now(), shipment.updatedAt.getTime() + 1)) } });
      if (shipment.assignedCourierId && !assignment) await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'ASSIGNMENT_CHANGED', notes: `Responsable anterior: ${shipment.assignedCourier?.displayName ?? 'desconocido'}; nuevo: ninguno` } });
      if (shipment.status !== 'RESCHEDULED') await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: 'RESCHEDULED' } });
      const notes = `Fecha anterior: ${previousDate} | Franja anterior: ${shipment.plannedWindowStart && shipment.plannedWindowEnd ? `${shipment.plannedWindowStart}-${shipment.plannedWindowEnd}` : 'sin franja'} | Nueva fecha: ${input.date}${start && end ? ` | Nueva franja: ${start}-${end}` : ' | Sin franja'} | Motivo: ${input.reason} | Próxima acción: ${input.nextAction} | Asignación: ${input.keepAssignment ? `conservada (${shipment.assignedCourier?.displayName})` : 'pendiente de planificación'}${input.incidentId ? ` | Incidencia: ${input.incidentId}` : ' | Decisión administrativa'}${input.proposalId ? ` | Propuesta: ${input.proposalId}` : ''}${input.observation ? ` | Observación: ${input.observation}` : ''}`;
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'RESCHEDULED', notes } });
      return { status: 'RESCHEDULED', plannedFor: input.date, plannedWindowStart: start, plannedWindowEnd: end };
    });
  }
}
