import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller, Get, Global, Module, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { UsersModule } from '../dist/users/users.module.js';
import { ZitadelProvisioningService } from '../dist/users/zitadel-provisioning.service.js';
import { OperationalUserGuard } from '../dist/users/operational-user.guard.js';
import { RequireRoles } from '../dist/users/require-roles.decorator.js';
import { RolesGuard } from '../dist/users/roles.guard.js';

// These routes exist only in this test application.
class RoleProbeController {
  admin() { return { allowed: true }; }
  withoutPolicy() { return { allowed: true }; }
}
Controller('__access-test')(RoleProbeController);
UseGuards(OperationalUserGuard, RolesGuard)(RoleProbeController);
for (const method of ['admin', 'withoutPolicy']) {
  const descriptor = Object.getOwnPropertyDescriptor(RoleProbeController.prototype, method);
  Get(method)(RoleProbeController.prototype, method, descriptor);
  if (method === 'admin') RequireRoles('ADMIN')(RoleProbeController.prototype, method, descriptor);
}

class TestConfigModule {}
Global()(TestConfigModule);
Module({
  providers: [{ provide: ConfigService, useValue: {
    get: () => undefined,
    getOrThrow: (key) => {
      if (key === 'DATABASE_URL') return 'postgresql://127.0.0.1:1/not_used_by_test';
      throw new Error('Unexpected configuration access');
    },
  } }],
  exports: [ConfigService],
})(TestConfigModule);

class TestApplication {}
Module({ imports: [TestConfigModule, UsersModule], controllers: [RoleProbeController] })(TestApplication);

test('operational HTTP access uses the real module and guard chain', { timeout: 15000 }, async (t) => {
  const app = await NestFactory.create(TestApplication, { logger: false, abortOnError: false });
  const records = new Map(['ADMIN', 'OPERATOR', 'CUSTOMER', 'COURIER'].map((role) => [
    `subject-${role}`, { id: `user-${role}`, email: `${role.toLowerCase()}@example.invalid`, displayName: role, role, enabled: true },
  ]));
  records.set('subject-disabled', { ...records.get('subject-CUSTOMER'), id: 'user-disabled', email: 'disabled@example.invalid', displayName: 'Disabled user', enabled: false });
  let userLookups = 0;
  let directoryReads = 0;
  const prisma = app.get(PrismaService);
  // No database connection: replace this application's instance before lifecycle hooks.
  prisma.onModuleInit = async () => {};
  prisma.user.findUnique = async ({ where }) => {
    userLookups++;
    if (where.externalAuthId === 'database-offline') throw new Error('private database failure');
    const user = records.get(where.externalAuthId);
    return user ? { ...user, externalAuthId: where.externalAuthId, privateField: 'hidden' } : null;
  };
  const directoryRows = (where) => [...records.values()].filter((user) => {
    if (where.role !== undefined && user.role !== where.role) return false;
    if (where.enabled !== undefined && user.enabled !== where.enabled) return false;
    return !where.OR || where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => user[field].toLowerCase().includes(filter.contains.toLowerCase())));
  }).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
  prisma.user.findMany = async ({ where, skip, take }) => {
    directoryReads++;
    return directoryRows(where).slice(skip, skip + take).map((user) => ({ ...user, externalAuthId: 'private-identity' }));
  };
  prisma.user.count = async ({ where }) => {
    directoryReads++;
    return directoryRows(where).length;
  };
  app.get(AuthTokenService).verify = async (token) => {
    if (token === 'invalid') throw new UnauthorizedException('Invalid access token');
    if (token === 'auth-offline') throw new ServiceUnavailableException('Authentication unavailable');
    return { sub: token };
  };
  const provisioning = app.get(ZitadelProvisioningService);
  provisioning.canInvite = () => true;
  let invitations = 0;
  provisioning.invite = async ({ email }) => { invitations++; return { email, userId: 'identity', invitation: 'sent' }; };
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const request = (path, subject, extraHeaders = {}) => fetch(`${origin}/api/${path}`, {
      headers: { ...(subject ? { Authorization: `Bearer ${subject}` } : {}), ...extraHeaders },
    });

    await t.test('invitations require an enabled local administrator even when the identity is allowlisted', async () => {
      const send = (subject) => fetch(`${origin}/api/users/invitations`, { method: 'POST', headers: { Authorization: `Bearer ${subject}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'person@example.invalid', firstName: 'Ana', lastName: 'Test' }) });
      for (const subject of ['subject-disabled', 'not-linked', 'subject-CUSTOMER', 'subject-OPERATOR']) {
        assert.equal((await request('users/invitations/access', subject)).status, 403);
        assert.equal((await send(subject)).status, 403);
      }
      assert.equal(invitations, 0);
      assert.equal((await request('users/invitations/access', 'subject-ADMIN')).status, 200);
      assert.equal((await send('subject-ADMIN')).status, 201);
      assert.equal(invitations, 1);
      provisioning.canInvite = () => false;
      assert.deepEqual(await (await request('users/invitations/access', 'subject-ADMIN')).json(), { canInvite: false });
      assert.equal((await send('subject-ADMIN')).status, 403);
      assert.equal(invitations, 1);
      provisioning.canInvite = () => true;
      userLookups = 0;
    });

    await t.test('invalid or missing authentication is rejected before user lookup', async () => {
      for (const subject of [undefined, 'invalid']) {
        assert.equal((await request('users/me', subject)).status, 401);
      }
      assert.equal((await request('users/me', undefined, { Authorization: 'Basic invalid' })).status, 401);
      assert.equal(userLookups, 0);
    });

    await t.test('each supported enabled role can read only its own projected profile', async () => {
      for (const role of ['ADMIN', 'OPERATOR', 'CUSTOMER', 'COURIER']) {
        const response = await request('users/me', `subject-${role}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), records.get(`subject-${role}`));
      }
    });

    await t.test('unlinked and disabled identities receive indistinguishable denial', async () => {
      const missing = await request('users/me', 'not-linked');
      const disabled = await request('users/me', 'subject-disabled');
      assert.equal(missing.status, 403);
      assert.equal(disabled.status, 403);
      assert.deepEqual(await missing.json(), await disabled.json());
    });

    await t.test('roles are enforced from local data, not caller-supplied headers', async () => {
      assert.equal((await request('__access-test/admin', 'subject-ADMIN')).status, 200);
      assert.equal((await request('__access-test/admin', 'subject-CUSTOMER', { 'x-user-role': 'ADMIN', 'x-user-enabled': 'true' })).status, 403);
    });

    await t.test('only ADMIN can query the directory, even when callers send an ADMIN filter', async () => {
      const before = directoryReads;
      for (const subject of ['subject-OPERATOR', 'subject-CUSTOMER', 'subject-COURIER', 'subject-disabled', 'not-linked']) {
        assert.equal((await request('users?role=ADMIN', subject, { 'x-user-role': 'ADMIN' })).status, 403);
      }
      assert.equal((await request('users')).status, 401);
      assert.equal(directoryReads, before);
    });

    await t.test('ADMIN can filter and paginate the directory without exposing identity linkage', async () => {
      const filtered = await request('users?role=CUSTOMER&status=disabled&search=disabled', 'subject-ADMIN');
      assert.equal(filtered.status, 200);
      assert.equal(filtered.headers.get('cache-control'), 'no-store');
      const result = await filtered.json();
      assert.deepEqual(result, { items: [records.get('subject-disabled')], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      const page = await (await request('users?page=2&pageSize=2', 'subject-ADMIN')).json();
      assert.equal(page.items.length, 2);
      assert.equal(page.page, 2);
      assert.equal(page.total, 5);
      assert.equal(page.totalPages, 3);
    });

    await t.test('invalid directory parameters return 400 to an authorized administrator', async () => {
      for (const parameters of ['pageSize=51', 'role=SUPERADMIN', 'page=0', 'role=ADMIN&role=CUSTOMER']) {
        assert.equal((await request(`users?${parameters}`, 'subject-ADMIN')).status, 400);
      }
    });

    await t.test('a protected handler with no declared role policy denies even administrators', async () => {
      assert.equal((await request('__access-test/withoutPolicy', 'subject-ADMIN')).status, 403);
    });

    await t.test('disabling a user or changing their role takes effect on the next request', async () => {
      const admin = records.get('subject-ADMIN');
      admin.enabled = false;
      assert.equal((await request('users/me', 'subject-ADMIN')).status, 403);
      admin.enabled = true;
      admin.role = 'OPERATOR';
      assert.equal((await request('__access-test/admin', 'subject-ADMIN')).status, 403);
      assert.equal((await (await request('users/me', 'subject-ADMIN')).json()).role, 'OPERATOR');
    });

    await t.test('infrastructure failures deny access with safe 503 responses', async () => {
      for (const subject of ['database-offline', 'auth-offline']) {
        const response = await request('users/me', subject);
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /private database|not_used_by_test/);
      }
    });

    await t.test('external-identity diagnostic keeps its existing contract', async () => {
      const response = await request('auth/me', 'subject-disabled');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { sub: 'subject-disabled' });
    });
  } finally {
    await app.close();
  }
});
