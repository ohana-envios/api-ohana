import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

if (process.env.DATABASE_URL !== 'postgresql://ohana_test@127.0.0.1:56543/ohana_isolated_test') throw new Error('Requires dedicated isolated PostgreSQL');
process.env.NODE_ENV = 'test';
for (const key of ['ZITADEL_ISSUER_URL', 'ZITADEL_PROJECT_ID', 'ZITADEL_WEB_CLIENT_IDS', 'ZITADEL_MOBILE_CLIENT_IDS', 'ZITADEL_API_CLIENT_ID', 'ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');

test('self-registration is unique, pending and approved atomically by an administrator', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const suffix = randomUUID();
  app.get(ConfigService).set('ZITADEL_ISSUER_URL', 'https://identity.example.test');
  app.get(AuthTokenService).verify = async token => ({ sub: `${token}-${suffix}` });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://identity.example.test/oidc/v1/userinfo') {
      const token = init.headers.Authorization.slice(7);
      return new Response(JSON.stringify({ sub: `${token}-${suffix}`, email: `CUSTOMER-${suffix}@example.invalid`, email_verified: token !== 'unverified' }));
    }
    return originalFetch(url, init);
  };
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1');
    const db = app.get(PrismaService);
    const admin = await db.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { externalAuthId: `operator-${suffix}`, email: `operator-${suffix}@example.invalid`, displayName: 'Operador', role: 'OPERATOR' } });
    const url = await app.getUrl();
    const post = token => fetch(`${url}/api/customer-registrations`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'PERSON', displayName: 'Cliente', phone: '' }) });
    const approve = (token, id) => fetch(`${url}/api/customer-registrations/${id}/approve`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await post('unverified')).status, 403);
    const concurrent = await Promise.all([post('customer'), post('different')]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
    const registration = await db.customerRegistration.findUniqueOrThrow({ where: { emailKey: `customer-${suffix}@example.invalid` }, include: { user: true, customer: true } });
    assert.equal(registration.pending, true);
    assert.equal(registration.user.enabled, false);
    assert.equal(registration.customer.enabled, false);
    const changeCustomerAccess = (enabled, expectedEnabled, role = 'CUSTOMER') => fetch(`${url}/api/users/${registration.userId}/access`, { method: 'PATCH', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ role, enabled, expected: { role: 'CUSTOMER', enabled: expectedEnabled } }) });
    assert.equal((await changeCustomerAccess(true, false)).status, 409);
    const pendingIdentity = registration.user.externalAuthId.split(`-${suffix}`)[0];
    assert.equal((await fetch(`${url}/api/users/me`, { headers: { Authorization: `Bearer ${pendingIdentity}` } })).status, 403);
    assert.equal((await fetch(`${url}/api/customer-registrations/pending`, { headers: { Authorization: 'Bearer operator' } })).status, 403);
    const list = await fetch(`${url}/api/customer-registrations/pending`, { headers: { Authorization: 'Bearer admin' } });
    assert.equal(list.status, 200);
    assert.ok((await list.json()).items.some(item => item.id === registration.id));
    assert.equal((await approve('operator', registration.id)).status, 403);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_registration_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "test_reject_registration_audit" BEFORE INSERT ON "UserAccessAudit" FOR EACH ROW WHEN (NEW."targetUserId" = '${registration.userId}') EXECUTE FUNCTION test_reject_registration_audit()`);
    try {
      assert.equal((await approve('admin', registration.id)).status, 500);
      const failed = await db.customerRegistration.findUniqueOrThrow({ where: { id: registration.id }, include: { user: true, customer: true } });
      assert.equal(failed.pending, true);
      assert.equal(failed.user.enabled, false);
      assert.equal(failed.customer.enabled, false);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "test_reject_registration_audit" ON "UserAccessAudit"');
      await db.$executeRawUnsafe('DROP FUNCTION test_reject_registration_audit()');
    }
    const selfAudit = await db.customerCreationAudit.findUniqueOrThrow({ where: { customerId: registration.customerId } });
    assert.equal(selfAudit.actorUserId, registration.userId);
    assert.equal(selfAudit.source, 'SELF');
    const adminPost = (token, body) => fetch(`${url}/api/customer-registrations/admin`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const draft = { type: 'PERSON', displayName: 'Cliente administrativo', phone: '', email: `CREATED-${suffix}@example.invalid` };
    assert.equal((await adminPost('operator', draft)).status, 403);
    assert.equal((await adminPost('admin', { ...draft, enabled: true })).status, 400);
    assert.equal((await adminPost('admin', { ...draft, email: registration.emailKey })).status, 409);
    const userCount = await db.user.count({ where: { email: draft.email.toLowerCase() } });
    const createdResults = await Promise.all([adminPost('admin', draft), adminPost('admin', draft)]);
    assert.deepEqual(createdResults.map(r => r.status).sort(), [201, 409]);
    const createdId = (await createdResults.find(r => r.status === 201).json()).id;
    const created = await db.customer.findUniqueOrThrow({ where: { id: createdId } });
    assert.equal(created.enabled, true);
    assert.equal(created.email, draft.email.toLowerCase());
    assert.equal(await db.user.count({ where: { email: draft.email.toLowerCase() } }), userCount);
    const creationAudit = await db.customerCreationAudit.findUniqueOrThrow({ where: { customerId: createdId } });
    assert.equal(creationAudit.actorUserId, admin.id);
    assert.equal(creationAudit.source, 'ADMIN');
    await assert.rejects(db.customerCreationAudit.delete({ where: { id: creationAudit.id } }));
    assert.equal((await adminPost('admin', { ...draft, email: '' })).status, 201);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_customer_creation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "test_reject_customer_creation" BEFORE INSERT ON "CustomerCreationAudit" FOR EACH ROW EXECUTE FUNCTION test_reject_customer_creation()`);
    try {
      const failingEmail = `failure-${suffix}@example.invalid`;
      assert.equal((await adminPost('admin', { ...draft, email: failingEmail })).status, 500);
      assert.equal(await db.customer.count({ where: { email: failingEmail } }), 0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "test_reject_customer_creation" ON "CustomerCreationAudit"');
      await db.$executeRawUnsafe('DROP FUNCTION test_reject_customer_creation()');
    }
    const approvals = await Promise.all([approve('admin', registration.id), approve('admin', registration.id)]);
    assert.deepEqual(approvals.map(r => r.status).sort(), [200, 409]);
    const updated = await db.customerRegistration.findUniqueOrThrow({ where: { id: registration.id }, include: { user: true, customer: true } });
    assert.equal(updated.pending, false);
    assert.equal(updated.approvedById, admin.id);
    assert.equal(updated.user.enabled, true);
    assert.equal(updated.customer.enabled, true);
    const audits = await db.userAccessAudit.findMany({ where: { targetUserId: registration.userId } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actorUserId, admin.id);
    assert.equal(audits[0].previousEnabled, false);
    assert.equal(audits[0].nextEnabled, true);
    assert.equal((await changeCustomerAccess(false, true)).status, 200);
    assert.equal((await changeCustomerAccess(true, false, 'ADMIN')).status, 409);
    assert.equal((await changeCustomerAccess(true, false)).status, 200);
    assert.equal(await db.userAccessAudit.count({ where: { targetUserId: registration.userId } }), 3);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: registration.customerId } })).enabled, true);
  } finally { globalThis.fetch = originalFetch; await app.close(); }
});
