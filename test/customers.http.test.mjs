import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthTokenService } from '../dist/auth/auth-token.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/not_used_by_test';
for (const key of ['ZITADEL_ISSUER_URL', 'ZITADEL_PROJECT_ID', 'ZITADEL_WEB_CLIENT_IDS', 'ZITADEL_MOBILE_CLIENT_IDS', 'ZITADEL_API_CLIENT_ID', 'ZITADEL_API_CLIENT_SECRET']) delete process.env[key];
const { AppModule } = await import('../dist/app.module.js');

test('customer reads require an enabled administrator and validate the HTTP contract', async () => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const prisma = app.get(PrismaService);
  prisma.onModuleInit = async () => {};
  prisma.user.findUnique = async ({ where }) => where.externalAuthId === 'missing' ? null : {
    id: 'u1', email: 'test@example.invalid', displayName: 'Test',
    role: where.externalAuthId === 'admin' || where.externalAuthId === 'disabled' ? 'ADMIN' :
      where.externalAuthId === 'operator' ? 'OPERATOR' : where.externalAuthId === 'courier' ? 'COURIER' : 'CUSTOMER',
    enabled: where.externalAuthId !== 'disabled',
  };
  let reads = 0;
  const customer = {
    id: 'customer-1', type: 'PERSON', displayName: 'Cliente de prueba', legalName: null,
    documentType: null, documentNumber: null, email: null, phone: null, enabled: true,
  };
  const address = { id: 'address-1', label: null, street: 'Calle', number: '1', locality: 'Montevideo', department: 'Montevideo', reference: null, notes: null, active: true };
  prisma.customer.findMany = async () => { reads++; return [{ ...customer, _count: { addresses: 1 }, privateField: 'hidden' }]; };
  prisma.customer.count = async () => { reads++; return 1; };
  prisma.customer.findUnique = async ({ where }) => { reads++; return where.id === customer.id ? { ...customer, addresses: [address], privateField: 'hidden' } : null; };
  let writes = 0;
  prisma.customer.update = async ({ where, data }) => {
    writes++;
    if (where.id !== customer.id || ['displayName', 'legalName', 'email', 'phone'].some((field) => where[field] !== customer[field])) throw Object.assign(new Error('not found'), { code: 'P2025' });
    Object.assign(customer, data);
    return { ...customer, addresses: [address], privateField: 'hidden' };
  };
  app.get(AuthTokenService).verify = async (token) => {
    if (token === 'invalid') throw new UnauthorizedException();
    return { sub: token };
  };
  app.setGlobalPrefix('api');
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const request = (path, token) => fetch(`${origin}/api/customers${path}`, {
      headers: token ? { Authorization: `Bearer ${token}`, 'x-user-role': 'ADMIN' } : {},
    });
    for (const token of [undefined, 'invalid']) assert.equal((await request('', token)).status, 401);
    for (const token of ['customer', 'operator', 'courier', 'disabled', 'missing']) {
      assert.equal((await request('', token)).status, 403);
      assert.equal((await request('/any-id', token)).status, 403);
    }
    assert.equal(reads, 0);
    const response = await request('?page=1&pageSize=10', 'admin');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { items: [{ ...customer, addressCount: 1 }], page: 1, pageSize: 10, total: 1, totalPages: 1 });
    const detail = await request('/customer-1', 'admin');
    assert.equal(detail.status, 200);
    assert.equal(detail.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await detail.json(), { ...customer, addressCount: 1, addresses: [address] });
    assert.equal((await request('?pageSize=51', 'admin')).status, 400);
    assert.equal((await request('/not-found', 'admin')).status, 404);
    const edit = (token, body, id = 'customer-1') => fetch(`${origin}/api/customers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'x-user-role': 'ADMIN' } : {}) }, body: JSON.stringify(body),
    });
    const valid = { displayName: ' Nuevo nombre ', legalName: '', email: ' email@example.invalid ', phone: ' +598 99 111 222 ', expected: { displayName: customer.displayName, legalName: customer.legalName, email: customer.email, phone: customer.phone } };
    assert.equal((await edit(undefined, valid)).status, 401);
    for (const role of ['customer', 'operator', 'courier', 'disabled', 'missing']) assert.equal((await edit(role, valid)).status, 403);
    assert.equal(writes, 0);
    for (const invalid of [{ ...valid, displayName: ' ' }, { ...valid, email: 'mal' }, { ...valid, phone: 'hola' }, { ...valid, enabled: false }, { displayName: 'Solo nombre' }, []]) {
      assert.equal((await edit('admin', invalid)).status, 400);
    }
    assert.equal(writes, 0);
    const saved = await edit('admin', valid);
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await saved.json(), { ...customer, addressCount: 1, addresses: [address] });
    assert.deepEqual({ displayName: customer.displayName, legalName: customer.legalName, email: customer.email, phone: customer.phone },
      { displayName: 'Nuevo nombre', legalName: null, email: 'email@example.invalid', phone: '+598 99 111 222' });
    assert.deepEqual(await (await request('/customer-1', 'admin')).json(), { ...customer, addressCount: 1, addresses: [address] });
    assert.equal((await edit('admin', valid)).status, 409);
    assert.equal((await edit('admin', valid, 'not-found')).status, 404);
  } finally {
    await app.close();
  }
});
