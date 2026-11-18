import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
if (process.env.DATABASE_URL !== 'postgresql://ohana_test@127.0.0.1:56543/ohana_isolated_test') throw new Error('Requires dedicated isolated PostgreSQL');
process.env.NODE_ENV = 'test';
for (const key of ['ZITADEL_ISSUER_URL', 'ZITADEL_PROJECT_ID', 'ZITADEL_WEB_CLIENT_IDS', 'ZITADEL_MOBILE_CLIENT_IDS', 'ZITADEL_API_CLIENT_ID', 'ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');

test('internal users start unlinked and disabled; creation and audit are atomic', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const suffix = randomUUID(); app.get(AuthTokenService).verify = async token => ({ sub: `${token}-${suffix}` }); app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1'); const db = app.get(PrismaService); const url = await app.getUrl();
    const admin = await db.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    await db.user.create({ data: { externalAuthId: `operator-${suffix}`, email: `operator-${suffix}@example.invalid`, displayName: 'Operator', role: 'OPERATOR' } });
    const create = (token, body) => fetch(`${url}/api/users`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const draft = { displayName: 'Nueva cuenta', email: `NEW-${suffix}@example.invalid`, role: 'OPERATOR' };
    assert.equal((await create('operator', draft)).status, 403);
    assert.equal((await create('admin', { ...draft, role: 'CUSTOMER' })).status, 400);
    assert.equal((await create('admin', { ...draft, externalAuthId: 'forged' })).status, 400);
    const pair = await Promise.all([create('admin', draft), create('admin', draft)]);
    assert.deepEqual(pair.map(r => r.status).sort(), [201, 409]);
    const response = await pair.find(r => r.status === 201).json();
    assert.equal(response.user.enabled, false); assert.equal('externalAuthId' in response.user, false);
    const saved = await db.user.findUniqueOrThrow({ where: { id: response.user.id } });
    assert.equal(saved.externalAuthId, null); assert.equal(saved.enabled, false); assert.equal(saved.email, draft.email.toLowerCase());
    const audit = await db.userCreationAudit.findUniqueOrThrow({ where: { targetUserId: saved.id } });
    assert.equal(audit.actorUserId, admin.id); assert.equal(audit.role, 'OPERATOR');
    await assert.rejects(db.userCreationAudit.delete({ where: { id: audit.id } }));
    const access = await fetch(`${url}/api/users/${saved.id}/access`, { method: 'PATCH', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'OPERATOR', enabled: true, expected: { role: 'OPERATOR', enabled: false } }) });
    assert.equal(access.status, 409);
    const unchanged = await fetch(`${url}/api/users/${saved.id}/access`, { method: 'PATCH', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'OPERATOR', enabled: false, expected: { role: 'OPERATOR', enabled: false } }) });
    assert.equal('externalAuthId' in (await unchanged.json()).user, false);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_user_creation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "test_reject_user_creation" BEFORE INSERT ON "UserCreationAudit" FOR EACH ROW WHEN (NEW."actorUserId" = '${admin.id}') EXECUTE FUNCTION test_reject_user_creation()`);
    try {
      const email = `failure-${suffix}@example.invalid`;
      assert.equal((await create('admin', { ...draft, email })).status, 500);
      assert.equal(await db.user.count({ where: { email } }), 0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "test_reject_user_creation" ON "UserCreationAudit"');
      await db.$executeRawUnsafe('DROP FUNCTION test_reject_user_creation()');
    }
  } finally { await app.close(); }
});
