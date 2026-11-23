import { BadRequestException } from '@nestjs/common';

const limits = { label: 80, street: 160, number: 30, locality: 80, department: 80, reference: 240, notes: 500 } as const;
const fields = Object.keys(limits) as (keyof typeof limits)[];
const required = ['street', 'number', 'locality', 'department'] as const;
export type AddressFields = { label: string | null; street: string; number: string; locality: string; department: string; reference: string | null; notes: string | null };
export type AddressEdit = AddressFields & { expected: AddressFields };

export function parseAddressStatus(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Estado de dirección inválido');
  const values = body as Record<string, unknown>;
  if (Object.keys(values).length !== 1 || typeof values.active !== 'boolean') throw new BadRequestException('Estado de dirección inválido');
  return values.active;
}

export function parseAddress(body: unknown, editing: false): AddressFields;
export function parseAddress(body: unknown, editing: true): AddressEdit;
export function parseAddress(body: unknown, editing: boolean): AddressFields | AddressEdit {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de dirección inválidos');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== fields.length + (editing ? 1 : 0) || fields.some((field) => typeof input[field] !== 'string')) throw new BadRequestException('Datos de dirección inválidos');
  const values = Object.fromEntries(fields.map((field) => [field, (input[field] as string).trim()])) as Record<keyof typeof limits, string>;
  if (fields.some((field) => values[field].length > limits[field]) || required.some((field) => !values[field])) throw new BadRequestException('Datos de dirección inválidos');
  const result: AddressFields = { label: values.label || null, street: values.street, number: values.number,
    locality: values.locality, department: values.department, reference: values.reference || null, notes: values.notes || null };
  if (!editing) return result;
  const expected = input.expected;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) throw new BadRequestException('Versión de dirección inválida');
  const previous = expected as Record<string, unknown>;
  if (Object.keys(previous).length !== fields.length || required.some((field) => typeof previous[field] !== 'string') ||
      (['label', 'reference', 'notes'] as const).some((field) => previous[field] !== null && typeof previous[field] !== 'string')) throw new BadRequestException('Versión de dirección inválida');
  return { ...result, expected: previous as AddressFields };
}
