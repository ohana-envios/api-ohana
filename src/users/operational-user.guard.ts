import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { UsersService } from './users.service.js';
import type { OperationalUserRequest } from './users.types.js';

@Injectable()
export class OperationalUserGuard implements CanActivate {
  constructor(private readonly tokens: AccessTokenGuard, private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperationalUserRequest>();
    delete request.currentUser;
    if (!await this.tokens.canActivate(context)) throw new UnauthorizedException('Authentication required');
    const subject = request.auth?.sub;
    if (!subject) throw new UnauthorizedException('Authenticated subject required');
    request.currentUser = await this.users.resolveEnabledUser(subject);
    return true;
  }
}
