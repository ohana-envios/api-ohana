import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { ZitadelProvisioningService } from './zitadel-provisioning.service.js';

type InviteBody = { email?: unknown; firstName?: unknown; lastName?: unknown };

@Controller('users')
@UseGuards(AccessTokenGuard)
export class ZitadelProvisioningController {
  constructor(private readonly provisioning: ZitadelProvisioningService) {}

  @Get('invitations/access')
  @Header('Cache-Control', 'no-store')
  invitationAccess(@Req() request: AuthenticatedRequest): { canInvite: boolean } {
    return { canInvite: this.provisioning.canInvite(request.auth!.sub) };
  }

  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  async invite(@Body() body: InviteBody | undefined, @Req() request: AuthenticatedRequest) {
    const subject = request.auth!.sub;
    if (!this.provisioning.canInvite(subject)) throw new ForbiddenException('No tienes permiso para invitar usuarios');

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Ingresá una dirección de correo válida');
    }
    if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
      throw new BadRequestException('Nombre y apellido son obligatorios (máximo 100 caracteres cada uno)');
    }
    return this.provisioning.invite({ email, firstName, lastName });
  }
}
