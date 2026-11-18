import { BadRequestException } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';
import { operationalRoles } from './users.types.js';

type AccessState = { role: UserRole; enabled: boolean };
export type AccessChange = AccessState & { expected: AccessState };

function state(value: unknown): AccessState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Estado de acceso inválido');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || typeof input.enabled !== 'boolean' ||
      typeof input.role !== 'string' || !(operationalRoles as readonly string[]).includes(input.role)) throw new BadRequestException('Estado de acceso inválido');
  return { role: input.role as UserRole, enabled: input.enabled };
}

export function parseAccessChange(value: unknown): AccessChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Cambio de acceso inválido');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 3) throw new BadRequestException('Cambio de acceso inválido');
  return { ...state({ role: input.role, enabled: input.enabled }), expected: state(input.expected) };
}
