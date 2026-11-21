import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CouriersModule } from '../dist/couriers/couriers.module.js';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

class TestConfig {}
Global()(TestConfig);
Module({ providers: [{ provide: ConfigService, useValue: { get: () => undefined, getOrThrow: () => process.env.DATABASE_URL } }], exports: [ConfigService] })(TestConfig);
class TestApp {}
Module({ imports: [TestConfig, CouriersModule] })(TestApp);

test('courier HTTP access, persistence, conflicts and audit', { timeout: 30000 }, async () => {
  assert.match(process.env.DATABASE_URL ?? '', /^postgresql:\/\/ohana_test@127\.0\.0\.1:(?:56543\/ohana_isolated_test|56544\/ohana_isolated_couriers\w*)$/);
  const app = await NestFactory.create(TestApp, { logger: false, abortOnError: false });
  const prisma = app.get(PrismaService);
  app.get(AuthTokenService).verify = async (token) => ({ sub: token });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  try {
    await prisma.user.createMany({ data: [
      { id: 'admin-test', externalAuthId: 'admin-test', displayName: 'Admin', email: 'admin@example.invalid', role: 'ADMIN', enabled: true },
      { id: 'courier-test', externalAuthId: 'courier-test', displayName: 'Courier', email: 'courier@example.invalid', role: 'COURIER', enabled: true },
    ] });
    const origin = await app.getUrl();
    const request = (path, role, method = 'GET', body) => fetch(`${origin}/api/couriers${path}`, { method, headers: { Authorization: `Bearer ${role}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = { displayName: 'Ana', active: true, available: true, vehicle: 'Bicicleta', capacity: '', workingHours: '', notes: '' };
    assert.equal((await request('', 'courier-test')).status, 403);
    assert.equal((await request('', 'courier-test', 'POST', data)).status, 403);
    const createdResponse = await request('', 'admin-test', 'POST', data);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.displayName, 'Ana');
    assert.equal((await (await request('/possible-duplicate?name=ana', 'admin-test')).json()).possibleDuplicate, true);
    assert.equal((await (await request(`/possible-duplicate?name=ana&exclude=${created.id}`, 'admin-test')).json()).possibleDuplicate, false);
    assert.equal((await prisma.courierAudit.count({ where: { courierId: created.id } })), 1);
    const list = await (await request('?search=ana', 'admin-test')).json();
    assert.equal(list.items.length, 1);
    const editedResponse = await request(`/${created.id}`, 'admin-test', 'PATCH', { ...data, active: false, version: created.version });
    assert.equal(editedResponse.status, 200);
    assert.equal((await editedResponse.json()).active, false);
    assert.equal((await request(`/${created.id}`, 'admin-test', 'PATCH', { ...data, version: created.version })).status, 409);
    assert.equal(await prisma.courierAudit.count({ where: { courierId: created.id } }), 2);
    await assert.rejects(() => prisma.courierAudit.deleteMany({ where: { courierId: created.id } }));
  } finally { await app.close(); }
});
