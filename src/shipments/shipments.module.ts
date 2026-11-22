import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentsReadService } from './shipments-read.service.js';
import { AssignmentService } from './assignment.service.js';
import { StatusService } from './status.service.js';
import { CustodyService } from './custody.service.js';
import { PlanningService } from './planning.service.js';

@Module({ imports: [PrismaModule, UsersModule], controllers: [ShipmentsController], providers: [ShipmentsService, ShipmentsReadService, AssignmentService, StatusService, CustodyService, PlanningService] })
export class ShipmentsModule {}
