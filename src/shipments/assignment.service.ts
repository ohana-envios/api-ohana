import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}
  async set(actorId: string, id: string, courierId: string | null, expected: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { status: true, assignedCourierId: true, assignedCourier: { select: { displayName: true } } } });
      if (!shipment) throw new NotFoundException('Envío no encontrado');
      if (shipment.assignedCourierId !== expected) throw new ConflictException('La asignación cambió. Recargá el envío.');
      if (shipment.status !== 'PENDING' && shipment.status !== 'IN_ROUTE') throw new ConflictException('El estado del envío no permite asignarlo.');
      if (courierId === shipment.assignedCourierId) return { assignedCourierId: courierId };
      const courier = courierId ? await tx.courier.findUnique({ where: { id: courierId }, select: { active: true, available: true, displayName: true } }) : null;
      if (courierId && (!courier || !courier.active || !courier.available)) throw new ConflictException('El repartidor no está disponible.');
      await tx.shipment.update({ where: { id }, data: { assignedCourierId: courierId } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: 'ASSIGNMENT_CHANGED', notes: `Responsable anterior: ${shipment.assignedCourier?.displayName ?? 'ninguno'}; nuevo: ${courier?.displayName ?? 'ninguno'}` } });
      return { assignedCourierId: courierId };
    });
  }
}
