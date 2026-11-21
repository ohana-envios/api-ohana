import { BadRequestException } from '@nestjs/common';

export type CourierDetails = {
  available: boolean;
  vehicle: string | null;
  capacity: string | null;
  workingHours: string | null;
  notes: string | null;
};

// These fields describe planning information; they do not grant account access.
export function parseCourierDetails(body: unknown): CourierDetails {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de repartidor inválidos');
  const input = body as Record<string, unknown>;
  const fields = ['vehicle', 'capacity', 'workingHours', 'notes'] as const;
  if (Object.keys(input).length !== fields.length + 1 || typeof input.available !== 'boolean' ||
      fields.some((field) => typeof input[field] !== 'string')) throw new BadRequestException('Datos de repartidor inválidos');
  const [vehicle, capacity, workingHours, notes] = fields.map((field) => (input[field] as string).trim());
  if (vehicle.length > 120 || capacity.length > 120 || workingHours.length > 120 || notes.length > 1000) {
    throw new BadRequestException('Datos de repartidor inválidos');
  }
  return { available: input.available, vehicle: vehicle || null, capacity: capacity || null, workingHours: workingHours || null, notes: notes || null };
}

export type CourierWrite = CourierDetails & { displayName: string; active: boolean; version?: number; confirmedActiveAssignments?: number };

export function parseCourierWrite(body: unknown, editing: boolean): CourierWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de repartidor inválidos');
  const input = body as Record<string, unknown>;
  const allowed = ['displayName', 'active', 'available', 'vehicle', 'capacity', 'workingHours', 'notes', ...(editing ? ['version', 'confirmedActiveAssignments'] : [])];
  if (Object.keys(input).some((key) => !allowed.includes(key)) ||
      typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 120 ||
      typeof input.active !== 'boolean' || (editing && (!Number.isSafeInteger(input.version) || (input.version as number) < 1)) ||
      (input.confirmedActiveAssignments !== undefined && (!Number.isSafeInteger(input.confirmedActiveAssignments) || (input.confirmedActiveAssignments as number) < 0))) {
    throw new BadRequestException('Datos de repartidor inválidos');
  }
  const details = parseCourierDetails({ available: input.available, vehicle: input.vehicle, capacity: input.capacity, workingHours: input.workingHours, notes: input.notes });
  return { ...details, displayName: input.displayName.trim(), active: input.active, ...(editing ? { version: input.version as number } : {}), ...(input.confirmedActiveAssignments !== undefined ? { confirmedActiveAssignments: input.confirmedActiveAssignments as number } : {}) };
}
