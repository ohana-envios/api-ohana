import { BadRequestException, Body, Controller, Header, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../auth/access-token.guard.js';
import { verifiedRegistrationIdentity } from '../registrations/verified-identity.js';
import { RegistrationTokenGuard } from '../registrations/registration-token.guard.js';
import { OperationalUserGuard } from './operational-user.guard.js';
import { RolesGuard } from './roles.guard.js';
import { RequireRoles } from './require-roles.decorator.js';
import type { OperationalUserRequest } from './users.types.js';
import { InvitationService, parseInvitationCode } from './invitation.service.js';

@Controller('user-invitations')
export class InvitationController {
  constructor(private readonly invitations: InvitationService, private readonly config: ConfigService) {}
  @Post(':userId')
  @UseGuards(OperationalUserGuard, RolesGuard)
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  issue(@Req() request: OperationalUserRequest, @Param('userId') id: string) {
    return this.invitations.issue(request.currentUser!.id, id);
  }
  @Post('customers/:customerId')
  @UseGuards(OperationalUserGuard, RolesGuard)
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  issueForCustomer(@Req() request: OperationalUserRequest, @Param('customerId') id: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { email?: unknown }).email !== 'string') throw new BadRequestException('Correo inválido');
    const email = (body as { email: string }).email.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Correo inválido');
    return this.invitations.issueForCustomer(request.currentUser!.id, id, email);
  }
  @Post('claim/redeem')
  @UseGuards(RegistrationTokenGuard)
  @Header('Cache-Control', 'no-store')
  async claim(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const code = parseInvitationCode(body);
    const identity = await verifiedRegistrationIdentity(this.config.getOrThrow<string>('ZITADEL_ISSUER_URL'), request.headers.authorization!.slice(7), request.auth!.sub);
    return this.invitations.claim(code, identity);
  }
}
