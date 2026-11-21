import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';

@Injectable()
export class RegistrationTokenGuard implements CanActivate {
  constructor(private readonly guard: AccessTokenGuard) {}
  canActivate(context: ExecutionContext): Promise<boolean> { return this.guard.canActivate(context); }
}
