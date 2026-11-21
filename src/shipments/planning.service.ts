import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const eligible = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_DEPOT', 'IN_ROUTE', 'NOT_DELIVERED', 'RESCHEDULED'] as const;
type Entry = { id: string; courierId: string; expectedCourierId: string | null; expectedPlannedFor: string | null };
export function parsePlanningDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Fecha inválida');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Fecha inválida');
  return date;
}
@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}
  async tasks(actorId: string, date: Date) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || actor.role !== 'COURIER') throw new ForbiddenException('Operation not permitted');
    return this.prisma.shipment.findMany({ where: { plannedFor: date, status: { in: [...eligible] }, assignedCourier: { is: { userId: actorId, active: true } } }, select: { id: true, code: true, status: true, priority: true, recipientName: true, recipientPhone: true, pickupStreet: true, pickupNumber: true, pickupLocality: true, deliveryStreet: true, deliveryNumber: true, deliveryLocality: true, requestedPickupAt: true, requestedDeliveryAt: true }, orderBy: [{ requestedPickupAt: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  }
  async get(actorId: string, date: Date, page: number, search: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
    const where = { status: { in: [...eligible] }, OR: [{ plannedFor: null }, { plannedFor: date }] };
    const [items, total, couriers] = await Promise.all([
      this.prisma.shipment.findMany({ where, select: { id: true, code: true, recipientName: true, status: true, plannedFor: true, assignedCourierId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
      this.prisma.shipment.count({ where }),
      this.prisma.courier.findMany({ where: { active: true, available: true, displayName: { contains: search, mode: 'insensitive' } }, select: { id: true, displayName: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], take: 101 }),
    ]);
    return { items, total, totalPages: Math.ceil(total / 20), couriers: couriers.slice(0, 100), moreCouriers: couriers.length > 100 };
  }
  async confirm(actorId: string, date: Date, entries: Entry[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      for (const entry of entries) {
        const shipment = await tx.shipment.findUnique({ where: { id: entry.id }, select: { status: true, plannedFor: true, assignedCourierId: true, assignedCourier: { select: { displayName: true } } } });
        if (!shipment) throw new NotFoundException('Envío no encontrado');
        if (shipment.assignedCourierId !== entry.expectedCourierId || (shipment.plannedFor?.toISOString().slice(0, 10) ?? null) !== entry.expectedPlannedFor) throw new ConflictException('La planificación cambió. Recargá la jornada.');
        if (!eligible.includes(shipment.status as typeof eligible[number]) || (shipment.plannedFor && shipment.plannedFor.getTime() !== date.getTime())) throw new ConflictException('El envío no está disponible para esta jornada.');
        const courier = await tx.courier.findUnique({ where: { id: entry.courierId }, select: { active: true, available: true, displayName: true } });
        if (!courier?.active || !courier.available) throw new ConflictException('El repartidor no está disponible.');
        const changedAssignment = shipment.assignedCourierId !== entry.courierId;
        const changedDate = !shipment.plannedFor;
        if (!changedAssignment && !changedDate) continue;
        const status = shipment.status === 'PENDING' ? 'ASSIGNED' : shipment.status;
        await tx.shipment.update({ where: { id: entry.id }, data: { plannedFor: date, assignedCourierId: entry.courierId, status } });
        if (changedAssignment) await tx.shipmentEvent.create({ data: { shipmentId: entry.id, actorUserId: actorId, actorLabel: actor.displayName, type: 'ASSIGNMENT_CHANGED', notes: `Responsable anterior: ${shipment.assignedCourier?.displayName ?? 'ninguno'}; nuevo: ${courier.displayName}` } });
        if (status !== shipment.status) await tx.shipmentEvent.create({ data: { shipmentId: entry.id, actorUserId: actorId, actorLabel: actor.displayName, type: 'STATUS_CHANGED', previousStatus: shipment.status, newStatus: status } });
        if (changedDate) await tx.shipmentEvent.create({ data: { shipmentId: entry.id, actorUserId: actorId, actorLabel: actor.displayName, type: 'PLAN_CHANGED', notes: `Jornada: ${date.toISOString().slice(0, 10)}` } });
      }
      return { planned: entries.length };
    });
  }
}
