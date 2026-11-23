import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReceiptFile } from './receipt-input.js';
import { EvidenceStorage } from './evidence-storage.js';

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService, private readonly evidenceStorage: EvidenceStorage) {}

  async deliver(actorId: string, id: string, receiver: string, observation?: string, relationship?: string, evidence?: ReceiptFile) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, custody: true, custodyCourierId: true, pickedUpAt: true, deliveredAt: true, assignedCourier: { select: { id: true, active: true, userId: true, displayName: true } } } });
      if (!shipment || !shipment.assignedCourier?.active || shipment.assignedCourier.userId !== actorId) throw new NotFoundException('Envío no encontrado');
      if (!['PICKED_UP', 'IN_ROUTE', 'IN_DEPOT', 'RESCHEDULED'].includes(shipment.status) || !shipment.pickedUpAt || shipment.deliveredAt || shipment.custody !== 'COURIER' || shipment.custodyCourierId !== shipment.assignedCourier.id) throw new ConflictException('El envío no está disponible para entrega. Verificá el estado y la custodia.');
      const now = new Date();
      const recipient = receiver.trim().replace(/\s+/g, ' ');
      const note = observation?.trim().replace(/\s+/g, ' ');
      const relation = relationship?.trim().replace(/\s+/g, ' ');
      const stored = evidence ? await this.evidenceStorage.save(evidence) : undefined;
      await tx.shipment.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: now, custody: 'RECIPIENT', custodyCourierId: null, custodyLocation: null, custodyVersion: { increment: 1 } } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: 'DELIVERED', occurredAt: now, notes: `Recibió: ${recipient}${relation ? ` | Relación: ${relation}` : ''}${note ? ` | Observación: ${note}` : ''}`, ...(stored ? { deliveryEvidence: { create: stored } } : {}) } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'CUSTODY_CHANGED', occurredAt: now, notes: `Repartidor: ${shipment.assignedCourier.displayName} -> Receptor: ${recipient}` } });
      return { status: 'DELIVERED', deliveredAt: now };
    });
  }

  async deliveryEvidence(actorId: string, id: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
    const visibility = actor.role === 'COURIER' ? { assignedCourier: { is: { userId: actorId, active: true } } } : {};
    const evidence = await this.prisma.deliveryEvidence.findFirst({ where: { event: { is: { shipmentId: id, type: 'STATUS_CHANGED', newStatus: 'DELIVERED', shipment: { is: visibility } } } }, select: { storageKey: true, sha256: true, size: true, mediaType: true } });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    const data = await this.evidenceStorage.read(evidence.storageKey, evidence.sha256, evidence.size);
    return { mediaType: evidence.mediaType, data: data.toString('base64') };
  }

  async pickup(actorId: string, id: string, observation?: string, evidence?: ReceiptFile) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operación no permitida');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, custody: true, pickedUpAt: true, assignedCourier: { select: { id: true, active: true, userId: true, displayName: true } } } });
      if (!shipment || !shipment.assignedCourier?.active || shipment.assignedCourier.userId !== actorId) throw new NotFoundException('Envío no encontrado');
      if (!['ASSIGNED', 'RESCHEDULED'].includes(shipment.status) || shipment.custody !== 'SENDER' || shipment.pickedUpAt) throw new ConflictException('El envío no está disponible para retiro.');
      const now = new Date();
      await tx.shipment.update({ where: { id }, data: { status: 'PICKED_UP', pickedUpAt: now, custody: 'COURIER', custodyCourierId: shipment.assignedCourier.id, custodyLocation: null, custodyVersion: { increment: 1 } } });
      const note = observation?.trim().replace(/\s+/g, ' ');
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: 'PICKED_UP', occurredAt: now, notes: note || null } });
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
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, pickedUpAt: true, assignedCourier: { select: { active: true, userId: true } } } });
      if (!shipment || (actor.role === 'COURIER' && (!shipment.assignedCourier?.active || shipment.assignedCourier.userId !== actorId))) throw new NotFoundException('Envío no encontrado');
      if (shipment.status !== expectedStatus) throw new ConflictException('El estado cambió. Recargá el envío.');
      const valid = status === 'IN_ROUTE' ? ['PICKED_UP', 'IN_DEPOT', 'RESCHEDULED'] : ['PICKED_UP', 'IN_ROUTE', 'RESCHEDULED'];
      if (shipment.status === 'RESCHEDULED' && !shipment.pickedUpAt) throw new ConflictException('El envío aún no fue retirado.');
      if (!valid.includes(shipment.status)) throw new ConflictException('El estado del envío no permite este cambio.');
      await tx.shipment.update({ where: { id }, data: { status } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: status, notes: observation?.trim().replace(/\s+/g, ' ') || null } });
      return { status };
    });
  }
}
