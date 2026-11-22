import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CourierWrite } from './courier-input.js';

const fields = { id: true, displayName: true, active: true, available: true, vehicle: true, capacity: true, workingHours: true, notes: true, version: true } as const;

@Injectable()
export class CouriersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search: string, page: number) {
    const where = { displayName: { contains: search, mode: 'insensitive' as const } };
    const [items, total] = await Promise.all([
      this.prisma.courier.findMany({ where, select: { ...fields, userId: true, user: { select: { id: true, email: true, displayName: true, role: true, enabled: true } }, _count: { select: { shipments: { where: { status: { notIn: ['DELIVERED', 'CANCELED'] } } } } } }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
      this.prisma.courier.count({ where }),
    ]);
    return { items: items.map(({ _count, ...item }) => ({ ...item, activeAssignmentCount: _count.shipments })), total, page, pageSize: 20, totalPages: Math.ceil(total / 20) };
  }

  async possibleDuplicate(name: string, exclude?: string) {
    const matches = await this.prisma.courier.findMany({ where: { displayName: { equals: name, mode: 'insensitive' }, ...(exclude ? { id: { not: exclude } } : {}) }, select: fields, orderBy: { id: 'asc' }, take: 20 });
    return { possibleDuplicate: matches.length > 0, matches };
  }

  async linkUser(actorId: string, courierId: string, userId: string | null, expectedUserId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const current = await tx.courier.findUnique({ where: { id: courierId }, select: { userId: true } });
      if (!current) throw new NotFoundException('Repartidor no encontrado');
      if (current.userId !== expectedUserId) throw new ConflictException('La cuenta vinculada cambió. Recargá la ficha.');
      if (current.userId === userId) return { userId };
      if (userId) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!user || user.role !== 'COURIER') throw new ConflictException('La cuenta debe tener el rol de repartidor.');
        const linked = await tx.courier.findUnique({ where: { userId }, select: { id: true } });
        if (linked) throw new ConflictException('Esta cuenta ya está vinculada a otra ficha.');
      }
      await tx.courier.update({ where: { id: courierId }, data: { userId, version: { increment: 1 } } });
      await tx.courierAudit.create({ data: { courierId, actorUserId: actorId, action: 'USER_LINK', fields: [`previous:${current.userId ?? ''}`, `next:${userId ?? ''}`] } });
      return { userId };
    });
  }

  async save(actorId: string, id: string | null, input: CourierWrite) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const { version, confirmedActiveAssignments, ...data } = input;
      if (!id) {
        const courier = await tx.courier.create({ data, select: fields });
        await tx.courierAudit.create({ data: { courierId: courier.id, actorUserId: actorId, action: 'CREATE', fields: Object.keys(data) } });
        return courier;
      }
      const current = await tx.courier.findUnique({ where: { id }, select: fields });
      if (!current) throw new NotFoundException('Repartidor no encontrado');
      if (current.version !== version) throw new ConflictException('La ficha cambió. Recargala antes de guardar.');
      if ((current.active && !data.active) || (current.available && !data.available)) {
        const activeCount = await tx.shipment.count({ where: { assignedCourierId: id, status: { notIn: ['DELIVERED', 'CANCELED'] } } });
        if (activeCount > 0 && confirmedActiveAssignments !== activeCount) throw new ConflictException('El repartidor tiene tareas activas. Recargá la ficha y confirmá la operación.');
      }
      const changed = (Object.keys(data) as Array<keyof typeof data>).filter((key) => current[key] !== data[key]);
      if (!changed.length) return current;
      const updated = await tx.courier.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('La ficha cambió. Recargala antes de guardar.');
      await tx.courierAudit.create({ data: { courierId: id, actorUserId: actorId, action: 'UPDATE', fields: changed } });
      return tx.courier.findUniqueOrThrow({ where: { id }, select: fields });
    });
  }
}
