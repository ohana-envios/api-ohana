import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgresql:\/\/ohana_test@127\.0\.0\.1:56543\/ohana_isolated_test$/.test(databaseUrl)) {
  throw new Error('This test requires the dedicated isolated PostgreSQL cluster on 127.0.0.1:56543');
}
process.env.NODE_ENV = 'test';
for (const key of ['ZITADEL_ISSUER_URL', 'ZITADEL_PROJECT_ID', 'ZITADEL_WEB_CLIENT_IDS', 'ZITADEL_MOBILE_CLIENT_IDS', 'ZITADEL_API_CLIENT_ID', 'ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');

test('customer and address operations persist and reject stale or unauthorized changes in isolated PostgreSQL', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const suffix = randomUUID();
  app.get(AuthTokenService).verify = async (token) => ({ sub: token === 'customer' ? `test-customer-${suffix}` : `test-admin-${suffix}` });
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1');
    const prisma = app.get(PrismaService);
    await prisma.user.create({ data: { externalAuthId: `test-admin-${suffix}`, email: `${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    await prisma.user.create({ data: { externalAuthId: `test-customer-${suffix}`, email: `customer-${suffix}@example.invalid`, displayName: 'Cliente', role: 'CUSTOMER' } });
    const customer = await prisma.customer.create({ data: {
      displayName: 'Inicial', type: 'PERSON', addresses: { create: { street: 'Calle', number: '10', locality: 'Centro', department: 'Montevideo' } },
    } });
    const origin = await app.getUrl();
    const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };
    const read = () => fetch(`${origin}/api/customers/${customer.id}`, { headers });
    const original = await (await read()).json();
    const expected = { displayName: original.displayName, legalName: original.legalName, email: original.email, phone: original.phone };
    const edit = (name) => fetch(`${origin}/api/customers/${customer.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ displayName: name, legalName: '', email: '', phone: '', expected }),
    });
    const [first, second] = await Promise.all([edit('Cambio uno'), edit('Cambio dos')]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const result = await (await read()).json();
    assert.ok(['Cambio uno', 'Cambio dos'].includes(result.displayName));
    assert.equal(result.addresses.length, 1);
    assert.equal(result.addresses[0].street, 'Calle');
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).displayName, result.displayName);
    const addressDraft = { label: ' Depósito ', street: ' Otra calle ', number: 's/n', locality: 'Centro', department: 'Montevideo', reference: '', notes: '' };
    const addressesUrl = `${origin}/api/customers/${customer.id}/addresses`;
    const firstAddressId = result.addresses[0].id;
    const lastAddress = await fetch(`${addressesUrl}/${firstAddressId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ active: false }) });
    assert.equal(lastAddress.status, 409);
    const addAddress = (body, auth = 'test') => fetch(addressesUrl, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
    assert.equal((await addAddress(addressDraft, 'customer')).status, 403);
    assert.equal((await addAddress({ ...addressDraft, street: '' })).status, 400);
    assert.equal((await addAddress({ ...addressDraft, customerId: 'otro' })).status, 400);
    assert.equal((await addAddress({ ...addressDraft, number: 'x'.repeat(31) })).status, 400);
    assert.equal((await fetch(`${origin}/api/customers/not-found/addresses`, { method: 'POST', headers, body: JSON.stringify(addressDraft) })).status, 404);
    const addedResponse = await addAddress(addressDraft);
    assert.equal(addedResponse.status, 201);
    const added = await addedResponse.json();
    assert.equal(added.addresses.length, 2);
    const created = added.addresses.find((item) => item.street === 'Otra calle');
    assert.equal(created.label, 'Depósito');
    assert.equal(created.reference, null);
    const shipment = await prisma.shipment.create({ data: {
      code: `test-${suffix}`, customerId: customer.id, senderName: 'Origen', recipientName: 'Destino',
      pickupStreet: created.street, pickupNumber: created.number, pickupLocality: created.locality, pickupDepartment: created.department,
      deliveryStreet: 'Destino', deliveryNumber: '1', deliveryLocality: 'Centro', deliveryDepartment: 'Montevideo',
    } });
    const expectedAddress = { label: created.label, street: created.street, number: created.number, locality: created.locality,
      department: created.department, reference: created.reference, notes: created.notes };
    const editAddress = (street, parent = customer.id, auth = 'test') => fetch(`${origin}/api/customers/${parent}/addresses/${created.id}`, {
      method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ ...addressDraft, street, expected: expectedAddress }),
    });
    assert.equal((await editAddress('Prohibida', customer.id, 'customer')).status, 403);
    assert.equal((await fetch(`${addressesUrl}/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify(addressDraft) })).status, 400);
    const other = await prisma.customer.create({ data: { displayName: 'Otro', type: 'PERSON' } });
    assert.equal((await editAddress('Cruce', other.id)).status, 404);
    const [addressOne, addressTwo] = await Promise.all([editAddress('Calle uno'), editAddress('Calle dos')]);
    assert.deepEqual([addressOne.status, addressTwo.status].sort(), [200, 409]);
    const persisted = await (await read()).json();
    assert.ok(['Calle uno', 'Calle dos'].includes(persisted.addresses.find((item) => item.id === created.id).street));
    assert.equal(persisted.addresses.find((item) => item.id !== created.id).street, 'Calle');
    assert.ok(persisted.addresses.every((item) => item.active === true));
    const setAddressStatus = (parent, id, active, auth = 'test') => fetch(`${origin}/api/customers/${parent}/addresses/${id}/status`, {
      method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify({ active }),
    });
    assert.equal((await setAddressStatus(customer.id, created.id, false, 'customer')).status, 403);
    assert.equal((await setAddressStatus(other.id, created.id, false)).status, 404);
    assert.equal((await setAddressStatus(customer.id, created.id, 'false')).status, 400);
    const [statusOne, statusTwo] = await Promise.all(persisted.addresses.map((item) => setAddressStatus(customer.id, item.id, false)));
    assert.deepEqual([statusOne.status, statusTwo.status].sort(), [200, 409]);
    const afterStatus = await (await read()).json();
    assert.equal(afterStatus.addresses.filter((item) => item.active).length, 1);
    const inactive = afterStatus.addresses.find((item) => !item.active);
    const active = afterStatus.addresses.find((item) => item.active);
    const beforeInactiveEdit = { label: inactive.label, street: inactive.street, number: inactive.number, locality: inactive.locality,
      department: inactive.department, reference: inactive.reference, notes: inactive.notes };
    const inactiveEdit = await fetch(`${addressesUrl}/${inactive.id}`, { method: 'PATCH', headers, body: JSON.stringify({
      label: inactive.label ?? '', street: 'Editada inactiva', number: inactive.number, locality: inactive.locality,
      department: inactive.department, reference: inactive.reference ?? '', notes: inactive.notes ?? '', expected: beforeInactiveEdit,
    }) });
    assert.equal(inactiveEdit.status, 200);
    assert.equal((await inactiveEdit.json()).addresses.find((item) => item.id === inactive.id).active, false);
    assert.equal((await setAddressStatus(customer.id, inactive.id, false)).status, 200);
    assert.equal((await setAddressStatus(customer.id, active.id, false)).status, 409);
    assert.equal((await setAddressStatus(customer.id, inactive.id, true)).status, 200);
    assert.equal((await setAddressStatus(customer.id, active.id, false)).status, 200);
    const final = await (await read()).json();
    assert.equal(final.addresses.length, 2);
    assert.equal(final.addresses.filter((item) => item.active).length, 1);
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).pickupStreet, created.street);
    const actor = await prisma.user.findUniqueOrThrow({ where: { externalAuthId: `test-admin-${suffix}` } });
    const audits = await prisma.customerDataAudit.findMany({ where: { customerId: customer.id } });
    for (const action of ['CUSTOMER_EDIT', 'ADDRESS_CREATE', 'ADDRESS_EDIT', 'ADDRESS_STATUS']) assert.ok(audits.some(item => item.action === action));
    assert.ok(audits.every(item => item.actorUserId === actor.id));
    assert.ok(audits.every(item => item.fields.every(field => !field.includes('@'))));
    await assert.rejects(prisma.customerDataAudit.delete({ where: { id: audits[0].id } }));
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_customer_data_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "test_reject_customer_data_audit" BEFORE INSERT ON "CustomerDataAudit" FOR EACH ROW WHEN (NEW."customerId" = '${customer.id}') EXECUTE FUNCTION test_reject_customer_data_audit()`);
    try {
      assert.equal((await addAddress({ ...addressDraft, street: 'Revertida' })).status, 500);
      assert.equal(await prisma.address.count({ where: { customerId: customer.id, street: 'Revertida' } }), 0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER "test_reject_customer_data_audit" ON "CustomerDataAudit"');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_customer_data_audit()');
    }

  } finally {
    await app.close();
  }
});
