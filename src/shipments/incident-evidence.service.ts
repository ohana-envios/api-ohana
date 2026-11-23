import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvidenceStorage } from './evidence-storage.js';
import type { ReceiptFile } from './receipt-input.js';

@Injectable()
export class IncidentEvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly storage: EvidenceStorage) {}

  private async access(actorId: string, shipmentId: string, incidentId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true } });
    if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
    const incident = await this.prisma.shipmentIncident.findFirst({ where: { id: incidentId, shipmentId, ...(actor.role === 'COURIER' ? { shipment: { is: { assignedCourier: { is: { userId: actorId, active: true } } } } } : {}) }, select: { id: true } });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');
    return actor.role;
  }

  async list(actorId: string, shipmentId: string, incidentId: string, page: number) {
    const role = await this.access(actorId, shipmentId, incidentId);
    const where = { incidentId, incident: { is: { shipmentId, ...(role === 'COURIER' ? { shipment: { is: { assignedCourier: { is: { userId: actorId, active: true } } } } } : {}) } } };
    const [items, total] = await Promise.all([
      this.prisma.incidentEvidence.findMany({ where, select: { id: true, actorLabel: true, mediaType: true, size: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
      this.prisma.incidentEvidence.count({ where }),
    ]);
    return { items, page, totalPages: Math.ceil(total / 20) };
  }

  async read(actorId: string, shipmentId: string, incidentId: string, evidenceId: string) {
    const role = await this.access(actorId, shipmentId, incidentId);
    const evidence = await this.prisma.incidentEvidence.findFirst({ where: { id: evidenceId, incidentId, incident: { is: { shipmentId, ...(role === 'COURIER' ? { shipment: { is: { assignedCourier: { is: { userId: actorId, active: true } } } } } : {}) } } }, select: { storageKey: true, sha256: true, size: true, mediaType: true } });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    const data = await this.storage.read(evidence.storageKey, evidence.sha256, evidence.size);
    return { mediaType: evidence.mediaType, data: data.toString('base64') };
  }

  async add(actorId: string, shipmentId: string, incidentId: string, requestKey: string, file: ReceiptFile) {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { enabled: true, role: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'COURIER'].includes(actor.role)) throw new ForbiddenException('Operación no permitida');
      const incident = await tx.shipmentIncident.findFirst({ where: { id: incidentId, shipmentId, ...(actor.role === 'COURIER' ? { shipment: { is: { assignedCourier: { is: { userId: actorId, active: true } } } } } : {}) }, select: { id: true } });
      if (!incident) throw new NotFoundException('Incidencia no encontrada');
      const previous = await tx.incidentEvidence.findUnique({ where: { requestKey } });
      if (previous) {
        if (previous.incidentId !== incidentId || previous.actorUserId !== actorId || previous.sha256 !== sha256 || previous.mediaType !== file.mimetype || previous.size !== file.size) throw new ConflictException('Identificador de operación ya utilizado');
        return { id: previous.id, createdAt: previous.createdAt };
      }
      const stored = await this.storage.save(file);
      const event = await tx.shipmentEvent.create({ data: { shipmentId, actorUserId: actorId, actorLabel: actor.displayName, type: 'INCIDENT_EVIDENCE_ADDED', notes: `Evidencia adjuntada a incidencia ${incidentId}` } });
      const evidence = await tx.incidentEvidence.create({ data: { requestKey, incidentId, eventId: event.id, actorUserId: actorId, actorLabel: actor.displayName, ...stored } });
      return { id: evidence.id, createdAt: evidence.createdAt };
    });
  }
}
