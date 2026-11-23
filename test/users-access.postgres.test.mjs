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

test('access changes are authorized, concurrency-safe and audited atomically', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const suffix = randomUUID();
  app.get(AuthTokenService).verify = async (token) => ({ sub: `${token}-${suffix}` });
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1');
    const prisma = app.get(PrismaService);
    const admin = await prisma.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    const target = await prisma.user.create({ data: { externalAuthId: `operator-${suffix}`, email: `operator-${suffix}@example.invalid`, displayName: 'Operador', role: 'OPERATOR' } });
    const customer = await prisma.user.create({ data: { externalAuthId: `customer-${suffix}`, email: `customer-${suffix}@example.invalid`, displayName: 'Cliente', role: 'CUSTOMER', enabled: false } });
    const origin = await app.getUrl();
    const change = (token, id, body) => fetch(`${origin}/api/users/${id}/access`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const draft = { role: 'COURIER', enabled: true, expected: { role: 'OPERATOR', enabled: true } };
    assert.equal((await change('operator', target.id, draft)).status, 403);
    assert.equal((await change('admin', target.id, { ...draft, enabled: 'true' })).status, 400);
    assert.equal((await change('admin', admin.id, { role: 'OPERATOR', enabled: true, expected: { role: 'ADMIN', enabled: true } })).status, 409);
    assert.equal((await change('admin', customer.id, { role: 'CUSTOMER', enabled: true, expected: { role: 'CUSTOMER', enabled: false } })).status, 409);
    const [first, second] = await Promise.all([change('admin', target.id, draft), change('admin', target.id, { ...draft, enabled: false })]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const result = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const audit = await prisma.userAccessAudit.findMany({ where: { targetUserId: target.id } });
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorUserId, admin.id);
    assert.equal(audit[0].previousRole, 'OPERATOR');
    assert.equal(audit[0].previousEnabled, true);
    assert.equal(audit[0].nextRole, result.role);
    assert.equal(audit[0].nextEnabled, result.enabled);
    assert.ok(audit[0].occurredAt instanceof Date);
    const count = await prisma.userAccessAudit.count({ where: { targetUserId: target.id } });
    const unchanged = { role: result.role, enabled: result.enabled, expected: { role: result.role, enabled: result.enabled } };
    assert.equal((await change('admin', target.id, unchanged)).status, 200);
    assert.equal(await prisma.userAccessAudit.count({ where: { targetUserId: target.id } }), count);
    await assert.rejects(prisma.userAccessAudit.update({ where: { id: audit[0].id }, data: { nextEnabled: !audit[0].nextEnabled } }));
    await assert.rejects(prisma.userAccessAudit.delete({ where: { id: audit[0].id } }));
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_access_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "test_reject_access_audit" BEFORE INSERT ON "UserAccessAudit" FOR EACH ROW WHEN (NEW."targetUserId" = '${target.id}') EXECUTE FUNCTION test_reject_access_audit()`);
    try {
      const failed = await change('admin', target.id, { role: result.role, enabled: !result.enabled, expected: { role: result.role, enabled: result.enabled } });
      assert.equal(failed.status, 500);
      const afterFailure = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(afterFailure.role, result.role);
      assert.equal(afterFailure.enabled, result.enabled);
      assert.equal(await prisma.userAccessAudit.count({ where: { targetUserId: target.id } }), count);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER "test_reject_access_audit" ON "UserAccessAudit"');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_access_audit()');
    }
  } finally { await app.close(); }
});
