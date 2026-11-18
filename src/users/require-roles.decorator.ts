import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';

export const REQUIRED_ROLES = 'ohana:required-roles';
export const RequireRoles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);
