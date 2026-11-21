import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ShipmentsService } from '../src/shipments/shipments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ShipmentInput } from '../src/shipments/shipment-types.js';

test('a retry returns the original shipment without repeating side effects and cannot cross actors', async () => {
  let record: Record<string, unknown> | null = null;
  let addressCreates = 0;
  let shipmentCreates = 0;
  const tx = {
    $executeRaw: async () => 0, $queryRaw: async () => [],
    user: { findUnique: async () => ({ role: 'ADMIN', enabled: true, displayName: 'Admin' }) },
    customer: { findUnique: async () => ({ enabled: true, displayName: 'Cliente', phone: '099' }) },
    address: { create: async () => { addressCreates++; return { id: 'address' }; } },
    customerDataAudit: { create: async () => ({}) },
    shipment: {
      findUnique: async ({ where }: { where: { code: string } }) => record?.code === where.code ? record : null,
      findFirst: async ({ where }: { where: { OR: Array<{ requestKey?: string; code?: string }> } }) => { if (!record || !where.OR.some((item) => (item.requestKey && item.requestKey === record?.requestKey) || (item.code && item.code === record?.code))) return null; const { requestKey: _key, ...result } = record; return result; },
      create: async ({ data }: { data: Record<string, unknown> }) => { shipmentCreates++; record = { id: 'shipment', code: data.code, requestKey: data.requestKey, status: 'PENDING', createdAt: new Date(), createdByUserId: data.createdByUserId, customerId: data.customerId }; return { id: record.id, code: record.code, status: record.status, createdAt: record.createdAt }; },
    },
  };
  const prisma = { $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService;
  const service = new ShipmentsService(prisma);
  const address = { label: '', street: 'Calle', number: '1', locality: 'Montevideo', department: 'Montevideo', reference: '', notes: '' };
  const input = { customerId: 'customer', recipientName: 'Ana', recipientPhone: '099', pickup: { kind: 'new', address, save: true }, delivery: address, packageDescription: 'Caja', requestedPickupAt: null, requestedDeliveryAt: null, notes: null } as ShipmentInput;
  const key = '4b7e9f07-1840-45ce-998a-0a462a70ed11';
  const first = await service.create('admin', input, undefined, key);
  const second = await service.create('admin', input, undefined, key);
  assert.deepEqual(second, first);
  assert.equal(shipmentCreates, 1);
  assert.equal(addressCreates, 1);
  await assert.rejects(() => service.create('other-admin', input, undefined, key));
  await assert.rejects(() => service.create('admin', { ...input, customerId: 'other' }, undefined, key));
});
