import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { ShipmentsService } from '../dist/shipments/shipments.service.js';

test('shipment creation preserves address snapshots and enforces customer ownership', { timeout: 30000 }, async () => {
  assert.match(process.env.DATABASE_URL ?? '', /^postgresql:\/\/ohana_test@127\.0\.0\.1:(?:56543\/ohana_isolated_test|56544\/ohana_isolated_shipments\w*)$/);
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
  await prisma.$connect();
  try {
    await prisma.user.createMany({ data: [
      { id: 'ship-test-admin', email: 'ship-test-admin@example.invalid', displayName: 'Admin', role: 'ADMIN', enabled: true },
      { id: 'ship-test-client', email: 'ship-test-client@example.invalid', displayName: 'Client', role: 'CUSTOMER', enabled: true },
    ] });
    await prisma.customer.createMany({ data: [
      { id: 'one', displayName: 'Tienda', type: 'PERSON', enabled: true },
      { id: 'two', displayName: 'Otra', type: 'PERSON', enabled: true },
    ] });
    await prisma.customerRegistration.create({ data: { customerId: 'one', userId: 'ship-test-client', emailKey: 'ship-test-client@example.invalid', pending: false, approvedAt: new Date(), approvedById: 'ship-test-admin' } });
    const address = { label: null, street: 'Calle', number: '123', locality: 'Montevideo', department: 'Montevideo', reference: null, notes: null };
    const saved = await prisma.address.create({ data: { ...address, customerId: 'one' } });
    const input = { customerId: 'one', recipientName: 'Ana', recipientPhone: null, pickup: { kind: 'saved', id: saved.id }, delivery: address, packageDescription: 'Caja', requestedPickupAt: null, notes: null };
    const service = new ShipmentsService(prisma);
    const created = await service.create('ship-test-client', input);
    assert.equal(created.status, 'PENDING');
    assert.match(created.code, /^OH-/);
    await prisma.address.update({ where: { id: saved.id }, data: { street: 'Otra calle' } });
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: created.id }, include: { events: true, packages: true } });
    assert.equal(shipment.pickupStreet, 'Calle');
    assert.equal(shipment.custody, 'SENDER');
    assert.equal(shipment.packages[0].description, 'Caja');
    assert.equal(shipment.events[0].actorUserId, 'ship-test-client');
    assert.match(shipment.events[0].notes, /cliente\/remitente/);
    await assert.rejects(() => service.create('ship-test-client', { ...input, customerId: 'two' }));
    await assert.rejects(() => service.create('ship-test-admin', { ...input, customerId: 'two' }));
    assert.equal(await prisma.shipment.count({ where: { createdByUserId: 'ship-test-client' } }), 1);
  } finally { await prisma.$disconnect(); }
});
