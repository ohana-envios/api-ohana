import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard.js';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest): { sub: string } {
    return { sub: request.auth!.sub };
  }
}
