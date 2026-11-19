import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/client.js';
import { REQUIRED_ROLES } from './require-roles.decorator.js';
import type { OperationalUserRequest } from './users.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    const user = context.switchToHttp().getRequest<OperationalUserRequest>().currentUser;
    if (!user?.enabled || !roles?.length || !roles.includes(user.role)) throw new ForbiddenException('Operation not permitted');
    return true;
  }
}
