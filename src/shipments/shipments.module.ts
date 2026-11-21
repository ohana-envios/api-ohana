import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentsReadService } from './shipments-read.service.js';
import { AssignmentService } from './assignment.service.js';

@Module({ imports: [PrismaModule, UsersModule], controllers: [ShipmentsController], providers: [ShipmentsService, ShipmentsReadService, AssignmentService] })
export class ShipmentsModule {}
