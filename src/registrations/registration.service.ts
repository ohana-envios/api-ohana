import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { customerEmailExists, lockCustomerEmails } from '../customers/customer-email.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminRegistrationDraft, RegistrationDraft } from './registration-input.js';

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(identity: { subject: string; email: string }, input: RegistrationDraft) {
    return this.prisma.$transaction(async (tx) => {
      await lockCustomerEmails(tx);
      const [existingUser, existingRegistration, existingCustomer] = await Promise.all([
        tx.user.findFirst({ where: { OR: [{ externalAuthId: identity.subject }, { email: { equals: identity.email, mode: 'insensitive' } }] }, select: { id: true } }),
        tx.customerRegistration.findUnique({ where: { emailKey: identity.email }, select: { id: true } }),
        customerEmailExists(tx, identity.email),
      ]);
      if (existingUser || existingRegistration || existingCustomer) throw new ConflictException('No se pudo completar la solicitud. Contactá a Ohana.');
      const customer = await tx.customer.create({ data: { ...input, email: identity.email, enabled: false } });
      const user = await tx.user.create({ data: { displayName: input.displayName, email: identity.email, externalAuthId: identity.subject, role: 'CUSTOMER', enabled: false } });
      await tx.customerRegistration.create({ data: { customerId: customer.id, userId: user.id, emailKey: identity.email } });
      await tx.customerCreationAudit.create({ data: { customerId: customer.id, actorUserId: user.id, source: 'SELF' } });
      return { status: 'pending' as const };
    });
  }

  async registerByAdmin(actorId: string, input: AdminRegistrationDraft) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      await lockCustomerEmails(tx);
      if (input.email) {
        const [customer, registration] = await Promise.all([
          customerEmailExists(tx, input.email),
          tx.customerRegistration.findUnique({ where: { emailKey: input.email }, select: { id: true } }),
        ]);
        if (customer || registration) throw new ConflictException('No se pudo completar el registro. Revisá el correo.');
      }
      const customer = await tx.customer.create({ data: { ...input, enabled: true }, select: { id: true } });
      await tx.customerCreationAudit.create({ data: { customerId: customer.id, actorUserId: actorId, source: 'ADMIN' } });
      return { id: customer.id };
    });
  }

  async listPending(page: number) {
    const where = { pending: true };
    const pageSize = 25;
    const [items, total] = await Promise.all([
      this.prisma.customerRegistration.findMany({
        where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, createdAt: true, customer: { select: { displayName: true, type: true, email: true, phone: true } } },
      }),
      this.prisma.customerRegistration.count({ where }),
    ]);
    return { items, page, totalPages: Math.ceil(total / pageSize), total };
  }

  async approve(actorId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const registration = await tx.customerRegistration.findUnique({ where: { id }, include: { user: true, customer: true } });
      if (!registration) throw new NotFoundException('Solicitud no encontrada');
      if (!registration.pending || registration.user.role !== 'CUSTOMER' || registration.user.enabled || registration.customer.enabled)
        throw new ConflictException('La solicitud ya no está pendiente o requiere revisión.');
      await tx.customer.update({ where: { id: registration.customerId }, data: { enabled: true } });
      await tx.user.update({ where: { id: registration.userId }, data: { enabled: true } });
      const audit = await tx.userAccessAudit.create({ data: { actorUserId: actorId, targetUserId: registration.userId,
        previousRole: 'CUSTOMER', previousEnabled: false, nextRole: 'CUSTOMER', nextEnabled: true } });
      await tx.customerRegistration.update({ where: { id }, data: { pending: false, approvedAt: audit.occurredAt, approvedById: actorId } });
      return { status: 'approved' as const };
    });
  }
}
