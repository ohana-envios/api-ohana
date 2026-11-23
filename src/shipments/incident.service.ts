import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type IncidentInput = { requestKey: string; phase: string; failedAttempt: boolean; kind: string; description: string; nextAction?: string };

@Injectable()
export class IncidentService {
  constructor(private readonly prisma: PrismaService) {}

  private async access(actorId: string, id: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, select: { assignedCourier: { select: { userId: true, active: true } } } });
    if (!shipment || (actor.role === 'COURIER' && !(shipment.assignedCourier?.active && shipment.assignedCourier.userId === actorId))) throw new NotFoundException('Envío no encontrado');
  }

  async list(actorId: string, id: string, page: number) {
    await this.access(actorId, id);
    const where = { shipmentId: id };
    const [items, total] = await Promise.all([
      this.prisma.shipmentIncident.findMany({ where, include: { resolution: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
      this.prisma.shipmentIncident.count({ where }),
    ]);
    return { items, total, page, totalPages: Math.ceil(total / 20) };
  }

  async create(actorId: string, id: string, input: IncidentInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, pickedUpAt: true, assignedCourier: { select: { userId: true, active: true } } } });
      if (!shipment || (actor.role === 'COURIER' && !(shipment.assignedCourier?.active && shipment.assignedCourier.userId === actorId))) throw new NotFoundException('Envío no encontrado');
      const previous = await tx.shipmentIncident.findUnique({ where: { requestKey: input.requestKey } });
      if (previous) {
        if (previous.shipmentId !== id || previous.actorUserId !== actorId || previous.phase !== input.phase || previous.failedAttempt !== input.failedAttempt || previous.kind !== input.kind || previous.description !== input.description || previous.nextAction !== (input.nextAction ?? null)) throw new ConflictException('Identificador de operación ya utilizado');
        return previous;
      }
      if (['DELIVERED', 'CANCELED'].includes(shipment.status)) throw new ConflictException('El envío ya está cerrado');
      if (input.failedAttempt && ((input.phase === 'PICKUP' && shipment.pickedUpAt) || (input.phase === 'DELIVERY' && !shipment.pickedUpAt))) throw new ConflictException('El intento no corresponde al estado del retiro.');
      const incident = await tx.shipmentIncident.create({ data: { ...input, shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'INCIDENT_RECORDED', notes: `${input.failedAttempt ? 'Intento fallido' : 'Incidencia'}: ${input.kind} | ${input.description}` } });
      return incident;
    });
  }

  async resolve(actorId: string, shipmentId: string, incidentId: string, description: string, nextAction?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
      const incident = await tx.shipmentIncident.findFirst({ where: { id: incidentId, shipmentId }, include: { resolution: true } });
      if (!incident) throw new NotFoundException('Incidencia no encontrada');
      if (incident.resolution) {
        if (incident.resolution.actorUserId === actorId && incident.resolution.description === description && incident.resolution.nextAction === (nextAction ?? null)) return incident.resolution;
        throw new ConflictException('La incidencia ya fue resuelta');
      }
      const resolution = await tx.incidentResolution.create({ data: { incidentId, actorUserId: actorId, actorLabel: actor.displayName, description, nextAction } });
      await tx.shipmentEvent.create({ data: { shipmentId, actorUserId: actorId, actorLabel: actor.displayName, type: 'INCIDENT_RESOLVED', notes: `Resolución: ${description}` } });
      return resolution;
    });
  }
}
