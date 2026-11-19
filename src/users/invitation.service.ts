import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const invalid = () => new ConflictException('La invitación no está disponible o no corresponde a esta identidad.');
const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
export function parseInvitationCode(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Código inválido');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || typeof value.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.code)) throw new BadRequestException('Código inválido');
  return value.code;
}

@Injectable()
export class InvitationService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForCustomer(actorId: string, customerId: string, email: string) {
    const code = randomBytes(32).toString('base64url');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 21)`;
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, displayName: true, enabled: true } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      if (!customer.enabled) throw invalid();
      let association = await tx.customerRegistration.findUnique({ where: { customerId }, include: { user: true } });
      if (!association) {
        const existingUser = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
        const existingRegistration = await tx.customerRegistration.findUnique({ where: { emailKey: email }, select: { id: true } });
        if (existingUser || existingRegistration) throw invalid();
        const user = await tx.user.create({ data: { email, displayName: customer.displayName, role: 'CUSTOMER', enabled: false } });
        await tx.userCreationAudit.create({ data: { actorUserId: actorId, targetUserId: user.id, role: 'CUSTOMER' } });
        association = await tx.customerRegistration.create({ data: { customerId, userId: user.id, emailKey: email, pending: false, approvedAt: new Date(), approvedById: actorId }, include: { user: true } });
      }
      if (association.pending || !association.approvedAt || !association.approvedById || association.user.role !== 'CUSTOMER' ||
          association.user.enabled || association.user.externalAuthId || association.user.email.trim().toLowerCase() !== email) throw invalid();
      const now = new Date(); const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await tx.userInvitation.updateMany({ where: { targetUserId: association.userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await tx.userInvitation.create({ data: { targetUserId: association.userId, issuedById: actorId, tokenHash: hash(code), expiresAt } });
      return { code, expiresAt: expiresAt.toISOString() };
    });
  }

  async issue(actorId: string, targetId: string) {
    const code = randomBytes(32).toString('base64url');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, enabled: true, externalAuthId: true } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (target.role === 'CUSTOMER' || target.enabled || target.externalAuthId) throw invalid();
      const now = new Date(); const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await tx.userInvitation.updateMany({ where: { targetUserId: target.id, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await tx.userInvitation.create({ data: { targetUserId: target.id, issuedById: actorId, tokenHash: hash(code), expiresAt } });
      return { code, expiresAt: expiresAt.toISOString() };
    });
  }

  async claim(code: string, identity: { subject: string; email: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 21)`;
      const invitation = await tx.userInvitation.findUnique({ where: { tokenHash: hash(code) }, include: { target: true } });
      if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date() ||
          invitation.target.externalAuthId || invitation.target.enabled ||
          invitation.target.email.trim().toLowerCase() !== identity.email) throw invalid();
      if (invitation.target.role === 'CUSTOMER') {
        const registration = await tx.customerRegistration.findUnique({ where: { userId: invitation.targetUserId }, select: { pending: true, approvedAt: true, approvedById: true, customer: { select: { enabled: true } } } });
        if (!registration || registration.pending || !registration.approvedAt || !registration.approvedById || !registration.customer.enabled) throw invalid();
      }
      if (await tx.user.findUnique({ where: { externalAuthId: identity.subject }, select: { id: true } })) throw invalid();
      await tx.user.update({ where: { id: invitation.targetUserId }, data: { externalAuthId: identity.subject } });
      await tx.userInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date(), claimedSubject: identity.subject } });
      return { status: 'linked' as const };
    });
  }
}
