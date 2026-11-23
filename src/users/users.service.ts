import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { operationalRoles, type OperationalUser, type UserList, type UserListQuery } from './users.types.js';
import type { InternalUserDraft } from './users.create.js';
import type { AccessChange } from './users.access.js';

const userFields = {
  id: true, email: true, displayName: true, role: true, enabled: true,
} as const satisfies Prisma.UserSelect;
type UserRecord = Prisma.UserGetPayload<{ select: typeof userFields }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createInternal(actorId: string, input: InternalUserDraft) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: userFields });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 21)`;
      const existing = await tx.user.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } }, select: { id: true } });
      if (existing) throw new ConflictException('Ya existe una cuenta con ese correo.');
      const user = await tx.user.create({ data: { ...input, enabled: false }, select: userFields });
      await tx.userCreationAudit.create({ data: { actorUserId: actor.id, targetUserId: user.id, role: user.role } });
      return { user };
    });
  }

  async updateAccess(actorId: string, targetId: string, input: AccessChange) {
    return this.prisma.$transaction(async (tx) => {
      // All administrative access writes acquire this transaction-scoped lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: userFields });
      if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { ...userFields, externalAuthId: true } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (target.role !== input.expected.role || target.enabled !== input.expected.enabled) throw new ConflictException('El acceso cambió. Recargá la lista antes de editar.');
      if (target.role === input.role && target.enabled === input.enabled) { const { externalAuthId: _identity, ...user } = target; return { user, audit: null }; }
      if (target.id === actor.id && (input.role !== 'ADMIN' || !input.enabled)) throw new ConflictException('No podés quitar tu propio acceso de administración.');
      if (input.enabled && !target.externalAuthId) throw new ConflictException('Primero hay que vincular la identidad de esta cuenta.');
      // Only accounts with a completed initial approval may change access here.
      // Converting an internal account to or from CUSTOMER requires a separate association flow.
      if (target.role === 'CUSTOMER') {
        if (input.role !== 'CUSTOMER') throw new ConflictException('El rol de cliente requiere una asociación autorizada.');
        if (input.enabled) {
          const registration = await tx.customerRegistration.findUnique({ where: { userId: target.id }, select: { pending: true, approvedAt: true, approvedById: true } });
          if (!registration || registration.pending || !registration.approvedAt || !registration.approvedById)
            throw new ConflictException('El acceso de clientes requiere habilitación inicial y asociación válidas.');
        }
      } else if (input.role === 'CUSTOMER') {
        throw new ConflictException('El rol de cliente requiere una asociación autorizada.');
      }
      const user = await tx.user.update({ where: { id: targetId }, data: { role: input.role, enabled: input.enabled }, select: userFields });
      const record = await tx.userAccessAudit.create({ data: {
        actorUserId: actor.id, targetUserId: target.id, previousRole: target.role, previousEnabled: target.enabled,
        nextRole: input.role, nextEnabled: input.enabled,
      } });
      return { user, audit: { actorId: record.actorUserId, occurredAt: record.occurredAt.toISOString(),
        previous: { role: record.previousRole, enabled: record.previousEnabled }, next: { role: record.nextRole, enabled: record.nextEnabled } } };
    });
  }

  /** Administrative directory. The HTTP boundary must enforce the ADMIN policy. */
  async list(query: UserListQuery): Promise<UserList> {
    const where: Prisma.UserWhereInput = {};
    if (query.role !== 'all') where.role = query.role;
    if (query.status !== 'all') where.enabled = query.status === 'enabled';
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ displayName: contains }, { email: contains }];
    }
    try {
      const [records, total] = await Promise.all([
        this.prisma.user.findMany({
          where, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }], select: userFields,
        }),
        this.prisma.user.count({ where }),
      ]);
      return {
        items: records.map((user) => ({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, enabled: user.enabled })),
        page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
      };
    } catch {
      throw new ServiceUnavailableException('User directory unavailable');
    }
  }

  async resolveEnabledUser(subject: string): Promise<OperationalUser> {
    if (typeof subject !== 'string' || !subject.trim()) throw new UnauthorizedException('Authenticated subject required');
    let user: UserRecord | null;
    try {
      user = await this.prisma.user.findUnique({ where: { externalAuthId: subject }, select: userFields });
    } catch {
      throw new ServiceUnavailableException('User access unavailable');
    }
    if (!user?.enabled || !(operationalRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('User access not enabled');
    }
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, enabled: true };
  }
}
