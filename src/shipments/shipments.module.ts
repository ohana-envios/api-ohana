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
import { EvidenceStorage } from './evidence-storage.js';
import { IncidentService } from './incident.service.js';
import { ReschedulingService } from './rescheduling.service.js';
import { IncidentEvidenceService } from './incident-evidence.service.js';
import { EventEvidenceService } from './event-evidence.service.js';
import { RescheduleProposalService } from './reschedule-proposal.service.js';
import { ProposalPushService } from './proposal-push.service.js';

@Module({ imports: [PrismaModule, UsersModule], controllers: [ShipmentsController], providers: [ShipmentsService, ShipmentsReadService, AssignmentService, StatusService, CustodyService, PlanningService, EvidenceStorage, IncidentService, ReschedulingService, IncidentEvidenceService, EventEvidenceService, RescheduleProposalService, ProposalPushService] })
export class ShipmentsModule {}
