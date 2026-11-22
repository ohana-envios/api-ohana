import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReceiptFile } from './receipt-input.js';

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async pickup(actorId: string, id: string, observation?: string, evidence?: ReceiptFile) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, custody: true, pickedUpAt: true, assignedCourier: { select: { id: true, active: true, userId: true, displayName: true } } } });
      if (!shipment || !shipment.assignedCourier?.active || shipment.assignedCourier.userId !== actorId) throw new NotFoundException('Envío no encontrado');
      if (shipment.status !== 'ASSIGNED' || shipment.custody !== 'SENDER' || shipment.pickedUpAt) throw new ConflictException('El envío no está disponible para retiro.');
      const now = new Date();
      await tx.shipment.update({ where: { id }, data: { status: 'PICKED_UP', pickedUpAt: now, custody: 'COURIER', custodyCourierId: shipment.assignedCourier.id, custodyLocation: null, custodyVersion: { increment: 1 } } });
      const note = observation?.trim().replace(/\s+/g, ' ');
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: 'ASSIGNED', newStatus: 'PICKED_UP', occurredAt: now, notes: note || null } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'CUSTODY_CHANGED', occurredAt: now, notes: `Remitente -> Repartidor: ${shipment.assignedCourier.displayName}${note ? ` | Observacion: ${note}` : ''}`, ...(evidence ? { evidence: { create: { mediaType: evidence.mimetype, size: evidence.size, data: Uint8Array.from(evidence.buffer) } } } : {}) } });
      return { status: 'PICKED_UP', pickedUpAt: now };
    });
  }

  async cancel(actorId: string, id: string, expectedStatus: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, custody: true, pickedUpAt: true } });
      if (!shipment) throw new NotFoundException('Envío no encontrado');
      if (shipment.status !== expectedStatus) throw new ConflictException('El estado cambió. Recargá el envío.');
      if (!['PENDING', 'ASSIGNED'].includes(shipment.status) || shipment.custody !== 'SENDER' || shipment.pickedUpAt) throw new ConflictException('Solo se puede cancelar antes del retiro.');
      await tx.shipment.update({ where: { id }, data: { status: 'CANCELED' } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: 'CANCELED', notes: `Motivo: ${reason.trim().replace(/\s+/g, ' ')}` } });
      return { status: 'CANCELED' };
    });
  }

  async set(actorId: string, id: string, expectedStatus: string, status: 'IN_ROUTE' | 'IN_DEPOT', observation?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, assignedCourier: { select: { active: true, userId: true } } } });
      if (!shipment || (actor.role === 'COURIER' && (!shipment.assignedCourier?.active || shipment.assignedCourier.userId !== actorId))) throw new NotFoundException('Envío no encontrado');
      if (shipment.status !== expectedStatus) throw new ConflictException('El estado cambió. Recargá el envío.');
      const valid = status === 'IN_ROUTE' ? ['PICKED_UP', 'IN_DEPOT'] : ['PICKED_UP', 'IN_ROUTE'];
      if (!valid.includes(shipment.status)) throw new ConflictException('El estado del envío no permite este cambio.');
      await tx.shipment.update({ where: { id }, data: { status } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: status, notes: observation?.trim().replace(/\s+/g, ' ') || null } });
      return { status };
    });
  }
}
