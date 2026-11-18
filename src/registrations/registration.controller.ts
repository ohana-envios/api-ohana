import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { OperationalUserGuard } from '../users/operational-user.guard.js';
import { RolesGuard } from '../users/roles.guard.js';
import { RequireRoles } from '../users/require-roles.decorator.js';
import type { OperationalUserRequest } from '../users/users.types.js';
import { parseAdminRegistration, parseRegistration } from './registration-input.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationTokenGuard } from './registration-token.guard.js';
import { verifiedRegistrationIdentity } from './verified-identity.js';

@Controller('customer-registrations')
export class RegistrationController {
  constructor(private readonly registrations: RegistrationService, private readonly config: ConfigService) {}

  @Post()
  @UseGuards(RegistrationTokenGuard)
  @Header('Cache-Control', 'no-store')
  async register(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRegistration(body);
    const issuer = this.config.getOrThrow<string>('ZITADEL_ISSUER_URL');
    const identity = await verifiedRegistrationIdentity(issuer, request.headers.authorization!.slice(7), request.auth!.sub);
    return this.registrations.register(identity, input);
  }

  @Post('admin')
  @UseGuards(OperationalUserGuard, RolesGuard)
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  registerByAdmin(@Req() request: OperationalUserRequest, @Body() body: unknown) {
    return this.registrations.registerByAdmin(request.currentUser!.id, parseAdminRegistration(body));
  }

  @Get('pending')
  @UseGuards(OperationalUserGuard, RolesGuard)
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  pending(@Query('page') value?: string) {
    if (value !== undefined && (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value))) throw new BadRequestException('Página inválida');
    return this.registrations.listPending(value === undefined ? 1 : Number(value));
  }

  @Patch(':id/approve')
  @UseGuards(OperationalUserGuard, RolesGuard)
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  approve(@Req() request: OperationalUserRequest, @Param('id') id: string) {
    return this.registrations.approve(request.currentUser!.id, id);
  }
}
