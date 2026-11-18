import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OperationalUserGuard } from './operational-user.guard.js';
import { RolesGuard } from './roles.guard.js';
import { RegistrationTokenGuard } from '../registrations/registration-token.guard.js';
import { InvitationController } from './invitation.controller.js';
import { InvitationService } from './invitation.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UsersController, InvitationController],
  providers: [UsersService, OperationalUserGuard, RolesGuard, InvitationService, RegistrationTokenGuard],
  exports: [UsersService, OperationalUserGuard, RolesGuard, AuthModule],
})
export class UsersModule {}
