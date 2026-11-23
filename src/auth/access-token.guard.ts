import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service.js';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  auth?: { sub: string };
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !/^Bearer [^\s]+$/i.test(header)) {
      throw new UnauthorizedException('Bearer token required');
    }
    request.auth = await this.tokens.verify(header.slice(7));
    return true;
  }
}
