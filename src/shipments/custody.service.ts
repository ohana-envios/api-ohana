import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReceiptFile } from './receipt-input.js';

type Transfer = ({ expectedVersion: number; kind: 'DEPOT'; location: string } | { expectedVersion: number; kind: 'COURIER'; courierId: string }) & { observation?: string };

@Injectable()
export class CustodyService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(actorId: string, page: number) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operation not permitted');
    const where = { custody: 'COURIER' as const, custodyCourier: { is: { userId: actorId, active: true } } };
    const pageSize = 20;
    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({ where, select: { id: true, code: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.shipment.count({ where }),
    ]);
    return { items, total, page, totalPages: Math.ceil(total / pageSize) };
  }

  async get(actorId: string, id: string, search: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operation not permitted');
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, select: { status: true, custody: true, custodyVersion: true, custodyLocation: true, custodyCourier: { select: { id: true, displayName: true, userId: true, active: true } }, assignedCourier: { select: { userId: true, active: true } } } });
    if (!shipment || (actor.role === 'COURIER' && !(shipment.assignedCourier?.active && shipment.assignedCourier.userId === actorId) && !(shipment.custodyCourier?.active && shipment.custodyCourier.userId === actorId))) throw new NotFoundException('Shipment not found');
    const [couriers, events] = await Promise.all([
      this.prisma.courier.findMany({ where: { active: true, displayName: { contains: search, mode: 'insensitive' } }, select: { id: true, displayName: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], take: 101 }),
      this.prisma.shipmentEvent.findMany({ where: { shipmentId: id, type: 'CUSTODY_CHANGED' }, select: { id: true, occurredAt: true, actorLabel: true, notes: true, evidence: { select: { id: true } } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 30 }),
    ]);
    return { kind: shipment.custody, version: shipment.custodyVersion, location: shipment.custodyLocation, courier: shipment.custodyCourier ? { id: shipment.custodyCourier.id, displayName: shipment.custodyCourier.displayName } : null, canTransfer: ['PICKED_UP', 'IN_ROUTE', 'IN_DEPOT', 'NOT_DELIVERED', 'RESCHEDULED'].includes(shipment.status) && (actor.role === 'ADMIN' || !!(shipment.custodyCourier?.active && shipment.custodyCourier.userId === actorId)) && ['COURIER', 'DEPOT'].includes(shipment.custody ?? ''), couriers: couriers.slice(0, 100), moreCouriers: couriers.length > 100, events };
  }

  async evidence(actorId: string, id: string, eventId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operation not permitted');
    const visible = actor.role === 'COURIER' ? { OR: [{ assignedCourier: { is: { userId: actorId, active: true } } }, { custodyCourier: { is: { userId: actorId, active: true } } }] } : {};
    const evidence = await this.prisma.custodyEvidence.findFirst({ where: { eventId, event: { is: { shipmentId: id, type: 'CUSTODY_CHANGED', shipment: { is: visible } } } }, select: { data: true, mediaType: true } });
    if (!evidence) throw new NotFoundException('Evidence not found');
    return { mediaType: evidence.mediaType, data: Buffer.from(evidence.data).toString('base64') };
  }

  async transfer(actorId: string, id: string, input: Transfer, evidence?: ReceiptFile) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operation not permitted');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, custody: true, custodyVersion: true, custodyLocation: true, custodyCourierId: true, custodyCourier: { select: { displayName: true, userId: true, active: true } } } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (actor.role === 'COURIER' && !(shipment.custody === 'COURIER' && shipment.custodyCourier?.active && shipment.custodyCourier.userId === actorId)) throw new ForbiddenException('Operation not permitted');
      if (shipment.custodyVersion !== input.expectedVersion) throw new ConflictException('Custody changed');
      if (!['PICKED_UP', 'IN_ROUTE', 'IN_DEPOT', 'NOT_DELIVERED', 'RESCHEDULED'].includes(shipment.status) || !['COURIER', 'DEPOT'].includes(shipment.custody ?? '')) throw new ConflictException('Custody transfer not available');
      const courier = input.kind === 'COURIER' ? await tx.courier.findUnique({ where: { id: input.courierId }, select: { id: true, active: true, displayName: true } }) : null;
      if (input.kind === 'COURIER' && !courier?.active) throw new ConflictException('Courier unavailable');
      const location = input.kind === 'DEPOT' ? input.location.trim() : null;
      if ((input.kind === 'COURIER' && shipment.custody === 'COURIER' && shipment.custodyCourierId === input.courierId) || (input.kind === 'DEPOT' && shipment.custody === 'DEPOT' && shipment.custodyLocation?.toLocaleLowerCase('es') === location?.toLocaleLowerCase('es'))) throw new ConflictException('Custody unchanged');
      const before = shipment.custody === 'COURIER' ? `Repartidor: ${shipment.custodyCourier?.displayName ?? 'desconocido'}` : `Ubicacion: ${shipment.custodyLocation ?? 'desconocida'}`;
      const after = input.kind === 'COURIER' ? `Repartidor: ${courier!.displayName}` : `Ubicacion: ${location}`;
      await tx.shipment.update({ where: { id }, data: { custody: input.kind, custodyCourierId: courier?.id ?? null, custodyLocation: location, custodyVersion: { increment: 1 } } });
      const observation = input.observation?.trim().replace(/\s+/g, ' ');
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'CUSTODY_CHANGED', notes: `${before} -> ${after}${observation ? ` | Observacion: ${observation}` : ''}`, ...(evidence ? { evidence: { create: { mediaType: evidence.mimetype, size: evidence.size, data: Uint8Array.from(evidence.buffer) } } } : {}) } });
      return { version: shipment.custodyVersion + 1 };
    });
  }
}
