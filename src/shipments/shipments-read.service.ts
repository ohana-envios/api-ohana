import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OperationalUser } from '../users/users.types.js';
import type { ShipmentQuery } from './shipment-query.js';

const summary = { id: true, code: true, recipientName: true, status: true, priority: true, createdAt: true, customer: { select: { displayName: true } } } as const;
const details = { ...summary, senderName: true, recipientPhone: true, pickupStreet: true, pickupNumber: true, pickupLocality: true, pickupDepartment: true, pickupReference: true,
  deliveryStreet: true, deliveryNumber: true, deliveryLocality: true, deliveryDepartment: true, deliveryReference: true, requestedPickupAt: true, requestedDeliveryAt: true, pickedUpAt: true, plannedFor: true, plannedWindowStart: true, plannedWindowEnd: true,
  packages: { select: { sequence: true, description: true }, orderBy: { sequence: 'asc' } }, receipt: { select: { id: true, version: true } }, assignedCourier: { select: { id: true, displayName: true } }, notes: true } as const satisfies Prisma.ShipmentSelect;

function scope(actor: OperationalUser): Prisma.ShipmentWhereInput {
  if (actor.role === 'ADMIN' || actor.role === 'OPERATOR') return {};
  if (actor.role === 'COURIER') return { assignedCourier: { is: { userId: actor.id, active: true } } };
  return { customer: { is: { enabled: true, registration: { is: { userId: actor.id, pending: false, approvedAt: { not: null }, approvedById: { not: null } } } } } };
}

@Injectable()
export class ShipmentsReadService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: OperationalUser, query: ShipmentQuery) {
    if (query.responsible && actor.role !== 'ADMIN' && actor.role !== 'OPERATOR') throw new ForbiddenException('Operation not permitted');
    const where: Prisma.ShipmentWhereInput = { AND: [scope(actor),
      ...(query.code ? [{ code: { contains: query.code, mode: 'insensitive' as const } }] : []),
      ...(query.customer ? [{ customer: { is: { displayName: { contains: query.customer, mode: 'insensitive' as const } } } }] : []),
      ...(query.recipient ? [{ recipientName: { contains: query.recipient, mode: 'insensitive' as const } }] : []),
      ...(query.responsible ? [{ assignedCourier: { is: { displayName: { contains: query.responsible, mode: 'insensitive' as const } } } }] : []),
      ...(query.status ? [{ status: query.status }] : []), ...(query.priority ? [{ priority: query.priority }] : []),
      ...(query.from || query.to ? [{ createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }] : []),
    ] };
    const pageSize = 20;
    const [items, total] = await Promise.all([this.prisma.shipment.findMany({ where, select: summary, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * pageSize, take: pageSize }), this.prisma.shipment.count({ where })]);
    return { items, total, page: query.page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
  async get(actor: OperationalUser, id: string) {
    const item = await this.prisma.shipment.findFirst({ where: { AND: [{ id }, scope(actor)] }, select: details });
    return this.project(actor, item);
  }
  async getByCode(actor: OperationalUser, code: string) {
    const legacyKey = /^OH-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(code)?.[1]?.toUpperCase();
    const item = await this.prisma.shipment.findFirst({ where: { AND: [{ OR: [{ code: { equals: code, mode: 'insensitive' } }, ...(legacyKey ? [{ requestKey: legacyKey }] : [])] }, scope(actor)] }, select: details });
    return this.project(actor, item);
  }
  private project(actor: OperationalUser, item: Prisma.ShipmentGetPayload<{ select: typeof details }> | null) {
    if (!item) throw new NotFoundException('Envío no encontrado');
    if (actor.role === 'ADMIN') return item;
    if (actor.role === 'OPERATOR') return { ...item, receipt: null };
    const { notes: _notes, assignedCourier: _assigned, ...visible } = item;
    return actor.role === 'COURIER' ? { ...visible, receipt: null } : visible;
  }
  async receipt(actor: OperationalUser, id: string) {
    const item = await this.prisma.shipment.findFirst({ where: { AND: [{ id }, scope(actor)] }, select: { receipt: { select: { data: true, mediaType: true } } } });
    if (!item?.receipt) throw new NotFoundException('Comprobante no encontrado');
    return item.receipt;
  }
  async history(actor: OperationalUser, id: string, page: number, type?: string) {
    const visible = await this.prisma.shipment.findFirst({ where: { AND: [{ id }, scope(actor)] }, select: { id: true } });
    if (!visible) throw new NotFoundException('Envío no encontrado');
    const where: Prisma.ShipmentEventWhereInput = { shipmentId: id, shipment: { is: scope(actor) }, AND: [...(actor.role === 'CUSTOMER' ? [{ type: { in: ['CREATED', 'STATUS_CHANGED', 'RECEIPT_ADDED', 'RECEIPT_REPLACED'] } }] : []), ...(type ? [{ type }] : [])] };
    const select = { type: true, occurredAt: true, actorLabel: true, notes: true, previousStatus: true, newStatus: true } as const;
    const [events, total] = await Promise.all([this.prisma.shipmentEvent.findMany({ where, select, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 30, take: 30 }), this.prisma.shipmentEvent.count({ where })]);
    return { items: actor.role === 'ADMIN' ? events : events.map(({ type, occurredAt, newStatus }) => ({ type, occurredAt, newStatus })), page, totalPages: Math.ceil(total / 30) };
  }
}
