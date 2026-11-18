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
test('customers can manage only their own approved, enabled customer record', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); const suffix = randomUUID();
  app.get(AuthTokenService).verify = async token => ({ sub: `${token}-${suffix}` }); app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1'); const db = app.get(PrismaService); const url = await app.getUrl();
    const admin = await db.user.create({ data: { externalAuthId: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, displayName: 'Admin', role: 'ADMIN' } });
    async function fixture(key, pending = false) {
      const user = await db.user.create({ data: { externalAuthId: `${key}-${suffix}`, email: `${key}-${suffix}@example.invalid`, displayName: key, role: 'CUSTOMER', enabled: true } });
      const customer = await db.customer.create({ data: { displayName: key, type: 'PERSON', enabled: true, addresses: { create: { street: key, number: '1', locality: 'Centro', department: 'Montevideo' } } }, include: { addresses: true } });
      await db.customerRegistration.create({ data: { userId: user.id, customerId: customer.id, emailKey: user.email, pending, approvedAt: pending ? null : new Date(), approvedById: pending ? null : admin.id } });
      return { user, customer };
    }
    const first = await fixture('first'); const other = await fixture('other'); await fixture('pending', true);
    const request = (token, path = '', method = 'GET', body) => fetch(`${url}/api/my-customer${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await request('admin')).status, 403); assert.equal((await request('pending')).status, 403);
    assert.equal((await fetch(`${url}/api/customers/${other.customer.id}`, { headers: { Authorization: 'Bearer first' } })).status, 403);
    const response = await request('first'); assert.equal(response.status, 200); const detail = await response.json(); assert.equal(detail.id, first.customer.id);
    const expected = { displayName: detail.displayName, legalName: detail.legalName, email: detail.email, phone: detail.phone };
    assert.equal((await request('first', '', 'PATCH', { displayName: 'Nuevo nombre', legalName: '', email: '', phone: '', expected })).status, 200);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: other.customer.id } })).displayName, 'other');
    assert.equal((await request('first', `/addresses/${other.customer.addresses[0].id}/status`, 'PATCH', { active: false })).status, 404);
    assert.equal((await request('first', `/addresses/${first.customer.addresses[0].id}/status`, 'PATCH', { active: false })).status, 409);
    const draft = { label: '', street: 'Nueva', number: '2', locality: 'Centro', department: 'Montevideo', reference: '', notes: '' };
    assert.equal((await request('first', '/addresses', 'POST', draft)).status, 201);
    assert.equal((await request('first', `/addresses/${first.customer.addresses[0].id}/status`, 'PATCH', { active: false })).status, 200);
    const events = await db.customerDataAudit.findMany({ where: { customerId: first.customer.id } });
    assert.ok(events.length >= 3); assert.ok(events.every(event => event.actorUserId === first.user.id));
    const otherEmail = `OTHER-${suffix}@example.invalid`;
    await db.customer.update({ where: { id: other.customer.id }, data: { email: `  ${otherEmail}  ` } });
    const current = await (await request('first')).json();
    const duplicate = await request('first', '', 'PATCH', { displayName: current.displayName, legalName: current.legalName ?? '', email: otherEmail.toLowerCase(), phone: current.phone ?? '', expected: { displayName: current.displayName, legalName: current.legalName, email: current.email, phone: current.phone } });
    assert.equal(duplicate.status, 409); const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.code, 'CUSTOMER_EMAIL_DUPLICATE'); assert.equal(JSON.stringify(duplicateBody).includes(other.customer.id), false);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: first.customer.id } })).email, null);
    await db.customer.update({ where: { id: first.customer.id }, data: { enabled: false } });
    assert.equal((await request('first')).status, 403); assert.equal((await request('first', '/addresses', 'POST', draft)).status, 403);
    await db.user.update({ where: { id: other.user.id }, data: { enabled: false } }); assert.equal((await request('other')).status, 403);
  } finally { await app.close(); }
});
