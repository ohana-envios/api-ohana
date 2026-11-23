import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type ExpoResponse = { data?: { status?: string; id?: string; details?: { error?: string } } | Record<string, { status?: string; details?: { error?: string } }>; errors?: unknown[] };
@Injectable()
export class ProposalPushService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { if (process.env.OHANA_PUSH_ENABLED === 'true') { this.timer = setInterval(() => { void this.drain(); }, 15000); this.timer.unref?.(); void this.drain(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async register(userId: string, token: string, expiresAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { enabled: true, role: true } });
      if (!user?.enabled || user.role !== 'ADMIN') throw new ForbiddenException('Operación no permitida');
      const device = await tx.pushDevice.upsert({ where: { token }, create: { token, userId, validUntil: expiresAt }, update: { userId, enabled: true, validUntil: expiresAt } });
      const pending = await tx.rescheduleProposal.findMany({ where: { decision: { is: null }, shipment: { is: { status: { notIn: ['DELIVERED', 'CANCELED'] } } } }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 100 });
      if (pending.length) await tx.pushDelivery.createMany({ data: pending.map((item) => ({ proposalId: item.id, deviceId: device.id })), skipDuplicates: true });
    });
    return { registered: true };
  }
  async deactivate(userId: string, token: string) {
    await this.prisma.pushDevice.updateMany({ where: { userId, token, enabled: true }, data: { enabled: false } });
    return { deactivated: true };
  }
  private async call(path: string, body: unknown): Promise<ExpoResponse> {
    const token = process.env.EXPO_ACCESS_TOKEN?.trim();
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Push service unavailable');
    const result = await response.json() as ExpoResponse;
    if (!result || typeof result !== 'object' || result.errors?.length || !result.data || typeof result.data !== 'object') throw new Error('Invalid push response');
    return result;
  }
  async drain() {
    if (this.running) return; this.running = true;
    try {
      const due = await this.prisma.pushDelivery.findMany({ where: { status: { in: ['PENDING', 'RECEIPT'] }, nextAttemptAt: { lte: new Date() } }, select: { id: true, status: true, nextAttemptAt: true }, orderBy: { nextAttemptAt: 'asc' }, take: 30 });
      for (const item of due) {
        const lease = new Date(Date.now() + 60000);
        const claim = await this.prisma.pushDelivery.updateMany({ where: { id: item.id, status: item.status, nextAttemptAt: item.nextAttemptAt }, data: { nextAttemptAt: lease, attempts: { increment: 1 } } });
        if (!claim.count) continue;
        const entry = await this.prisma.pushDelivery.findUnique({ where: { id: item.id }, include: { device: { include: { user: { select: { enabled: true, role: true } } } }, proposal: { select: { shipmentId: true, decision: { select: { id: true } }, shipment: { select: { status: true } } } } } });
        if (!entry) continue;
        const owned = { id: entry.id, status: entry.status, nextAttemptAt: lease };
        if (!entry.device.enabled || entry.device.validUntil.getTime() <= Date.now() || !entry.device.user.enabled || entry.device.user.role !== 'ADMIN' || entry.proposal.decision || ['DELIVERED', 'CANCELED'].includes(entry.proposal.shipment.status)) { await this.prisma.pushDelivery.updateMany({ where: owned, data: { status: 'CANCELED' } }); continue; }
        try {
          if (entry.status === 'PENDING') {
            const result = await this.call('send', { to: entry.device.token, title: 'Ohana Envíos', body: 'Tenés una propuesta de reprogramación pendiente.', sound: 'default', data: { type: 'reschedule-proposal', shipmentId: entry.proposal.shipmentId } });
            const data = result.data as { status?: string; id?: string; details?: { error?: string } };
            if (data.status !== 'ok' || typeof data.id !== 'string') { if (data.details?.error === 'DeviceNotRegistered') await this.prisma.pushDevice.updateMany({ where: { id: entry.deviceId }, data: { enabled: false } }); throw new Error(data.details?.error === 'DeviceNotRegistered' ? 'DeviceNotRegistered' : 'Push rejected'); }
            await this.prisma.pushDelivery.updateMany({ where: owned, data: { status: 'RECEIPT', ticketId: data.id, attempts: 0, nextAttemptAt: new Date(Date.now() + 60000), lastError: null } });
          } else {
            if (!entry.ticketId) throw new Error('Missing ticket');
            const result = await this.call('getReceipts', { ids: [entry.ticketId] });
            const receipt = (result.data as Record<string, { status?: string; details?: { error?: string } }>)[entry.ticketId];
            if (!receipt) throw new Error('Receipt pending');
            if (receipt.status !== 'ok') { if (receipt.details?.error === 'DeviceNotRegistered') await this.prisma.pushDevice.updateMany({ where: { id: entry.deviceId }, data: { enabled: false } }); throw new Error(receipt.details?.error === 'DeviceNotRegistered' ? 'DeviceNotRegistered' : 'Receipt rejected'); }
            await this.prisma.pushDelivery.updateMany({ where: owned, data: { status: 'DELIVERED', lastError: null } });
          }
        } catch (error) {
          const reason = error instanceof Error && error.message === 'DeviceNotRegistered' ? 'DeviceNotRegistered' : 'Delivery unavailable';
          await this.prisma.pushDelivery.updateMany({ where: owned, data: { status: entry.attempts >= 8 || reason === 'DeviceNotRegistered' ? 'FAILED' : entry.status, lastError: reason, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(entry.attempts, 7))) } });
        }
      }
    } catch { /* A failing provider or database must not interrupt the API. */ } finally { this.running = false; }
  }
}
