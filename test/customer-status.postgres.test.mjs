import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
if (process.env.DATABASE_URL !== 'postgresql://ohana_test@127.0.0.1:56543/ohana_isolated_test') throw new Error('Requires dedicated isolated PostgreSQL');
process.env.NODE_ENV = 'test';
for (const key of ['ZITADEL_ISSUER_URL','ZITADEL_PROJECT_ID','ZITADEL_WEB_CLIENT_IDS','ZITADEL_MOBILE_CLIENT_IDS','ZITADEL_API_CLIENT_ID','ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');
test('customer status changes are authorized, audited and preserve related data', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); const suffix = randomUUID();
  app.get(AuthTokenService).verify = async token => ({ sub: `${token}-${suffix}` }); app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1'); const db = app.get(PrismaService); const url = await app.getUrl();
    const admin = await db.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { externalAuthId: `operator-${suffix}`, email: `operator-${suffix}@example.invalid`, displayName: 'Operador', role: 'OPERATOR' } });
    const access = await db.user.create({ data: { externalAuthId: `client-${suffix}`, email: `client-${suffix}@example.invalid`, displayName: 'Cliente', role: 'CUSTOMER', enabled: true } });
    const customer = await db.customer.create({ data: { displayName: 'Cliente', type: 'PERSON', addresses: { create: { street: 'Calle', number: '1', locality: 'Centro', department: 'Montevideo' } } }, include: { addresses: true } });
    await db.customerRegistration.create({ data: { customerId: customer.id, userId: access.id, emailKey: `client-${suffix}@example.invalid`, pending: false, approvedAt: new Date(), approvedById: admin.id } });
    const change = (token, id, body) => fetch(`${url}/api/customers/${id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await change('operator', customer.id, { enabled: false })).status, 403);
    assert.equal((await change('admin', customer.id, { enabled: 'false' })).status, 400);
    assert.equal((await change('admin', customer.id, { enabled: false, extra: true })).status, 400);
    assert.equal((await change('admin', 'missing', { enabled: false })).status, 404);
    const response = await change('admin', customer.id, { enabled: false }); assert.equal(response.status, 200);
    const returned = await response.json(); assert.equal(returned.enabled, false); assert.equal(returned.addresses[0].active, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: access.id } })).enabled, true);
    let records = await db.customerStatusAudit.findMany({ where: { customerId: customer.id } });
    assert.equal(records.length, 1); assert.equal(records[0].actorUserId, admin.id); assert.equal(records[0].previousEnabled, true); assert.equal(records[0].nextEnabled, false);
    assert.equal((await change('admin', customer.id, { enabled: false })).status, 200);
    assert.equal(await db.customerStatusAudit.count({ where: { customerId: customer.id } }), 1);
    await assert.rejects(db.customerStatusAudit.delete({ where: { id: records[0].id } }));
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_customer_status() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "test_reject_customer_status" BEFORE INSERT ON "CustomerStatusAudit" FOR EACH ROW WHEN (NEW."customerId" = '${customer.id}') EXECUTE FUNCTION test_reject_customer_status()`);
    try { assert.equal((await change('admin', customer.id, { enabled: true })).status, 500); assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).enabled, false); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER "test_reject_customer_status" ON "CustomerStatusAudit"'); await db.$executeRawUnsafe('DROP FUNCTION test_reject_customer_status()'); }
    const simultaneous = await Promise.all([change('admin', customer.id, { enabled: true }), change('admin', customer.id, { enabled: true })]);
    assert.deepEqual(simultaneous.map(r => r.status), [200, 200]);
    records = await db.customerStatusAudit.findMany({ where: { customerId: customer.id } }); assert.equal(records.length, 2);
    const pendingCustomer = await db.customer.create({ data: { displayName: 'Pendiente', type: 'PERSON', enabled: false } });
    const pendingUser = await db.user.create({ data: { email: `pending-${suffix}@example.invalid`, displayName: 'Pendiente', role: 'CUSTOMER', enabled: false } });
    await db.customerRegistration.create({ data: { customerId: pendingCustomer.id, userId: pendingUser.id, emailKey: `pending-${suffix}@example.invalid` } });
    assert.equal((await change('admin', pendingCustomer.id, { enabled: true })).status, 409);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: pendingCustomer.id } })).enabled, false);
  } finally { await app.close(); }
});
