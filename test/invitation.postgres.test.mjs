import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
if (process.env.DATABASE_URL !== 'postgresql://ohana_test@127.0.0.1:56543/ohana_isolated_test') throw new Error('Requires dedicated isolated PostgreSQL');
process.env.NODE_ENV = 'test';
for (const key of ['ZITADEL_ISSUER_URL','ZITADEL_PROJECT_ID','ZITADEL_WEB_CLIENT_IDS','ZITADEL_MOBILE_CLIENT_IDS','ZITADEL_API_CLIENT_ID','ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');
test('invitations link only the matching verified identity, once and while valid', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); const suffix = randomUUID();
  app.get(ConfigService).set('ZITADEL_ISSUER_URL', 'https://identity.example.test');
  app.get(AuthTokenService).verify = async token => ({ sub: `${token}-${suffix}` });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://identity.example.test/oidc/v1/userinfo') {
      const token = init.headers.Authorization.slice(7);
      return new Response(JSON.stringify({ sub: `${token}-${suffix}`, email: `${token === 'registered' ? 'registered' : token === 'wrong' ? 'wrong' : token === 'expired' ? 'expired' : token === 'rollback' ? 'rollback' : 'target'}-${suffix}@example.invalid`, email_verified: token !== 'unverified' }));
    }
    return original(url, init);
  };
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1'); const db = app.get(PrismaService); const url = await app.getUrl();
    const admin = await db.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { externalAuthId: `operator-${suffix}`, email: `operator-${suffix}@example.invalid`, displayName: 'Operator', role: 'OPERATOR' } });
    const target = await db.user.create({ data: { email: `target-${suffix}@example.invalid`, displayName: 'Target', role: 'OPERATOR', enabled: false } });
    const issue = (token, id = target.id) => fetch(`${url}/api/user-invitations/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const claim = (token, code) => fetch(`${url}/api/user-invitations/claim/redeem`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    assert.equal((await issue('operator')).status, 403);
    const issued1 = await issue('admin'); assert.equal(issued1.status, 201); assert.equal(issued1.headers.get('cache-control'), 'no-store');
    const first = await issued1.json(); assert.match(first.code, /^[A-Za-z0-9_-]{43}$/);
    const stored1 = await db.userInvitation.findFirstOrThrow({ where: { targetUserId: target.id } });
    assert.notEqual(stored1.tokenHash, first.code); assert.equal(stored1.issuedById, admin.id);
    const second = await (await issue('admin')).json(); assert.notEqual(first.code, second.code);
    assert.equal((await claim('target', first.code)).status, 409);
    assert.equal((await claim('wrong', second.code)).status, 409);
    assert.equal((await claim('unverified', second.code)).status, 403);
    assert.equal((await claim('target', 'invalid')).status, 400);
    const pair = await Promise.all([claim('target', second.code), claim('other', second.code)]);
    assert.deepEqual(pair.map(r => r.status).sort(), [201, 409]);
    const linked = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(linked.enabled, false); assert.ok([`target-${suffix}`, `other-${suffix}`].includes(linked.externalAuthId));
    const records = await db.userInvitation.findMany({ where: { targetUserId: target.id }, orderBy: { createdAt: 'asc' } });
    assert.ok(records[0].revokedAt); assert.ok(records[1].usedAt); assert.equal(records[1].claimedSubject, linked.externalAuthId);
    assert.equal((await issue('admin')).status, 409);
    const change = await fetch(`${url}/api/users/${target.id}/access`, { method: 'PATCH', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'OPERATOR', enabled: true, expected: { role: 'OPERATOR', enabled: false } }) });
    assert.equal(change.status, 200);
    const expiredTarget = await db.user.create({ data: { email: `expired-${suffix}@example.invalid`, displayName: 'Expired', role: 'OPERATOR', enabled: false } });
    const expiredCode = randomBytes(32).toString('base64url');
    await db.userInvitation.create({ data: { targetUserId: expiredTarget.id, issuedById: admin.id, tokenHash: createHash('sha256').update(expiredCode).digest('hex'), expiresAt: new Date(0) } });
    assert.equal((await claim('expired', expiredCode)).status, 409);
    const rollbackTarget = await db.user.create({ data: { email: `rollback-${suffix}@example.invalid`, displayName: 'Rollback', role: 'COURIER', enabled: false } });
    const rollbackCode = await (await issue('admin', rollbackTarget.id)).json();
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_invitation_claim() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "test_reject_invitation_claim" BEFORE UPDATE ON "UserInvitation" FOR EACH ROW WHEN (NEW."targetUserId" = '${rollbackTarget.id}') EXECUTE FUNCTION test_reject_invitation_claim()`);
    try {
      assert.equal((await claim('rollback', rollbackCode.code)).status, 500);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: rollbackTarget.id } })).externalAuthId, null);
      assert.equal((await db.userInvitation.findFirstOrThrow({ where: { targetUserId: rollbackTarget.id } })).usedAt, null);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "test_reject_invitation_claim" ON "UserInvitation"');
      await db.$executeRawUnsafe('DROP FUNCTION test_reject_invitation_claim()');
    }
    const customer = await db.customer.create({ data: { type: 'PERSON', displayName: 'Cliente existente', enabled: true } });
    const customerEmail = `registered-${suffix}@example.invalid`;
    const issueCustomer = (token, email = customerEmail) => fetch(`${url}/api/user-invitations/customers/${customer.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal((await issueCustomer('operator')).status, 403);
    assert.equal((await issueCustomer('admin', 'invalid')).status, 400);
    assert.equal((await issueCustomer('admin', target.email)).status, 409);
    assert.equal(await db.customerRegistration.findUnique({ where: { customerId: customer.id } }), null);
    const firstCustomerInvitation = await issueCustomer('admin');
    assert.equal(firstCustomerInvitation.status, 201);
    const firstCustomerCode = (await firstCustomerInvitation.json()).code;
    const customerInvitation = await issueCustomer('admin');
    assert.equal(customerInvitation.status, 201); assert.equal(customerInvitation.headers.get('cache-control'), 'no-store');
    const customerCode = (await customerInvitation.json()).code;
    const registration = await db.customerRegistration.findUniqueOrThrow({ where: { customerId: customer.id }, include: { user: true } });
    assert.equal(registration.pending, false); assert.equal(registration.user.enabled, false);
    assert.equal((await claim('registered', firstCustomerCode)).status, 409);
    assert.equal((await claim('wrong', customerCode)).status, 409);
    assert.equal((await claim('registered', customerCode)).status, 201);
    assert.equal((await claim('registered', customerCode)).status, 409);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: registration.userId } })).externalAuthId, `registered-${suffix}`);
    assert.equal((await db.customer.count({ where: { id: customer.id } })), 1);
    assert.equal((await issueCustomer('admin')).status, 409);
    assert.equal((await fetch(`${url}/api/my-customer`, { headers: { Authorization: 'Bearer registered' } })).status, 403);
    const enableCustomer = await fetch(`${url}/api/users/${registration.userId}/access`, { method: 'PATCH', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'CUSTOMER', enabled: true, expected: { role: 'CUSTOMER', enabled: false } }) });
    assert.equal(enableCustomer.status, 200);
    const ownCustomer = await fetch(`${url}/api/my-customer`, { headers: { Authorization: 'Bearer registered' } });
    assert.equal(ownCustomer.status, 200); assert.equal((await ownCustomer.json()).id, customer.id);

    await assert.rejects(db.userInvitation.delete({ where: { id: records[1].id } }));
    await assert.rejects(db.userInvitation.update({ where: { id: records[1].id }, data: { usedAt: null } }));
  } finally { globalThis.fetch = original; await app.close(); }
});
