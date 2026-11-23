import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvidenceStorage } from './evidence-storage.js';
import type { ReceiptFile } from './receipt-input.js';

@Injectable()
export class EventEvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly storage: EvidenceStorage) {}
  private scope(actorId: string, role: string) {
    return role === 'COURIER' ? { OR: [{ assignedCourier: { is: { userId: actorId, active: true } } }, { custodyCourier: { is: { userId: actorId, active: true } } }] } : {};
  }
  private async access(actorId: string, shipmentId: string, targetEventId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
    const event = await this.prisma.shipmentEvent.findFirst({ where: { id: targetEventId, shipmentId, type: 'CUSTODY_CHANGED', shipment: { is: this.scope(actorId, actor.role) } }, select: { id: true } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    return actor.role;
  }
  async list(actorId: string, shipmentId: string, targetEventId: string, page: number) {
    const role = await this.access(actorId, shipmentId, targetEventId);
    const where = { targetEventId, targetEvent: { is: { shipmentId, type: 'CUSTODY_CHANGED', shipment: { is: this.scope(actorId, role) } } } };
    const [items, total] = await Promise.all([this.prisma.eventEvidence.findMany({ where, select: { id: true, actorLabel: true, mediaType: true, size: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }), this.prisma.eventEvidence.count({ where })]);
    return { items, page, totalPages: Math.ceil(total / 20) };
  }
  async read(actorId: string, shipmentId: string, targetEventId: string, id: string) {
    const role = await this.access(actorId, shipmentId, targetEventId);
    const item = await this.prisma.eventEvidence.findFirst({ where: { id, targetEventId, targetEvent: { is: { shipmentId, type: 'CUSTODY_CHANGED', shipment: { is: this.scope(actorId, role) } } } }, select: { storageKey: true, sha256: true, size: true, mediaType: true } });
    if (!item) throw new NotFoundException('Evidencia no encontrada');
    const data = await this.storage.read(item.storageKey, item.sha256, item.size);
    return { mediaType: item.mediaType, data: data.toString('base64') };
  }
  async add(actorId: string, shipmentId: string, targetEventId: string, requestKey: string, file: ReceiptFile) {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
      const target = await tx.shipmentEvent.findFirst({ where: { id: targetEventId, shipmentId, type: 'CUSTODY_CHANGED', shipment: { is: this.scope(actorId, actor.role) } }, select: { id: true } });
      if (!target) throw new NotFoundException('Evento no encontrado');
      const previous = await tx.eventEvidence.findUnique({ where: { requestKey } });
      if (previous) {
        if (previous.targetEventId !== targetEventId || previous.actorUserId !== actorId || previous.sha256 !== sha256 || previous.mediaType !== file.mimetype || previous.size !== file.size) throw new ConflictException('Identificador de operación ya utilizado');
        return { id: previous.id, createdAt: previous.createdAt };
      }
      const stored = await this.storage.save(file);
      const audit = await tx.shipmentEvent.create({ data: { shipmentId, actorUserId: actorId, actorLabel: actor.displayName, type: 'EVENT_EVIDENCE_ADDED', notes: `Evidencia adjuntada al evento ${targetEventId}` } });
      const item = await tx.eventEvidence.create({ data: { requestKey, targetEventId, auditEventId: audit.id, actorUserId: actorId, actorLabel: actor.displayName, ...stored } });
      return { id: item.id, createdAt: item.createdAt };
    });
  }
}
