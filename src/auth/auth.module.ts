import { Module } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthTokenService } from './auth-token.service.js';

@Module({ controllers: [AuthController], providers: [AuthTokenService, AccessTokenGuard] })
export class AuthModule {}
