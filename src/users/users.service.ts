import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { operationalRoles, type OperationalUser, type UserList, type UserListQuery } from './users.types.js';

const userFields = {
  id: true, email: true, displayName: true, role: true, enabled: true,
} as const satisfies Prisma.UserSelect;
type UserRecord = Prisma.UserGetPayload<{ select: typeof userFields }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
