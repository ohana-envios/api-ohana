import { BadRequestException } from '@nestjs/common';

export type InternalUserDraft = { displayName: string; email: string; role: 'ADMIN' | 'OPERATOR' | 'COURIER' };
export function parseInternalUser(value: unknown): InternalUserDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Datos de usuario inválidos');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || typeof input.displayName !== 'string' || typeof input.email !== 'string' ||
      (input.role !== 'ADMIN' && input.role !== 'OPERATOR' && input.role !== 'COURIER')) throw new BadRequestException('Datos de usuario inválidos');
  const displayName = input.displayName.trim(); const email = input.email.trim().toLowerCase();
  if (!displayName || displayName.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new BadRequestException('Datos de usuario inválidos');
  return { displayName, email, role: input.role };
}
