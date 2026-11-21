import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { CouriersController } from './couriers.controller.js';
import { CouriersService } from './couriers.service.js';

@Module({ imports: [PrismaModule, UsersModule], controllers: [CouriersController], providers: [CouriersService] })
export class CouriersModule {}
