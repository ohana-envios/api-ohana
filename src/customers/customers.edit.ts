import { BadRequestException } from '@nestjs/common';

export type CustomerFields = { displayName: string; legalName: string | null; email: string | null; phone: string | null };
export type CustomerEdit = CustomerFields & { expected: CustomerFields };

export function parseCustomerEdit(body: unknown): CustomerEdit {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de cliente inválidos');
  const values = body as Record<string, unknown>;
  const fields = ['displayName', 'legalName', 'email', 'phone'] as const;
  if (Object.keys(values).length !== fields.length + 1 || fields.some((field) => typeof values[field] !== 'string')) {
    throw new BadRequestException('Datos de cliente inválidos');
  }
  const expected = values.expected;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) throw new BadRequestException('Versión del cliente inválida');
  const previous = expected as Record<string, unknown>;
  if (Object.keys(previous).length !== fields.length || typeof previous.displayName !== 'string' ||
      (['legalName', 'email', 'phone'] as const).some((field) => previous[field] !== null && typeof previous[field] !== 'string')) {
    throw new BadRequestException('Versión del cliente inválida');
  }
  const [displayName, legalName, email, phone] = fields.map((field) => (values[field] as string).trim());
  if (!displayName || displayName.length > 120 || legalName.length > 160 ||
      email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      phone.length > 40 || (phone && (!/^[+\d() .-]+$/.test(phone) || !/\d/.test(phone)))) {
    throw new BadRequestException('Datos de cliente inválidos');
  }
  return { displayName, legalName: legalName || null, email: email || null, phone: phone || null,
    expected: { displayName: previous.displayName, legalName: previous.legalName as string | null, email: previous.email as string | null, phone: previous.phone as string | null } };
}
