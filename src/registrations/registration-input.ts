import { BadRequestException } from '@nestjs/common';

export type RegistrationDraft = { displayName: string; type: 'PERSON' | 'COMPANY'; phone: string | null };
export function parseRegistration(body: unknown): RegistrationDraft {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de registro inválidos');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 3 || typeof value.displayName !== 'string' ||
      (value.type !== 'PERSON' && value.type !== 'COMPANY') || typeof value.phone !== 'string') {
    throw new BadRequestException('Datos de registro inválidos');
  }
  const displayName = value.displayName.trim();
  const phone = value.phone.trim();
  if (!displayName || displayName.length > 120 || phone.length > 40 ||
      (phone && (!/^[+\d() .-]+$/.test(phone) || !/\d/.test(phone)))) throw new BadRequestException('Datos de registro inválidos');
  return { displayName, type: value.type, phone: phone || null };
}

export type AdminRegistrationDraft = RegistrationDraft & { email: string | null };
export function parseAdminRegistration(body: unknown): AdminRegistrationDraft {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de registro inválidos');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 4 || typeof value.email !== 'string') throw new BadRequestException('Datos de registro inválidos');
  const draft = parseRegistration({ displayName: value.displayName, type: value.type, phone: value.phone });
  const email = value.email.trim().toLowerCase();
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new BadRequestException('Datos de registro inválidos');
  return { ...draft, email: email || null };
}
