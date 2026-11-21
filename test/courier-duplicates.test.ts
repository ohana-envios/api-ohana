import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CouriersService } from '../src/couriers/couriers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

test('duplicate check returns matching profiles for review and excludes the current profile', async () => {
  let args: Record<string, unknown> | undefined;
  const prisma = { courier: { findMany: async (query: Record<string, unknown>) => { args = query; return [{ id: 'other', displayName: 'Ana', active: true, available: true, vehicle: 'Bicicleta' }]; } } } as unknown as PrismaService;
  const result = await new CouriersService(prisma).possibleDuplicate('Ana', 'current');
  assert.equal(result.possibleDuplicate, true);
  assert.equal(result.matches[0].vehicle, 'Bicicleta');
  assert.deepEqual((args?.where as Record<string, unknown>).id, { not: 'current' });
  assert.equal(args?.take, 20);
});
