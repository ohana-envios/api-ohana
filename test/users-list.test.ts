import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';
import { parseUserListQuery } from '../src/users/users.query.js';

test('user directory query normalizes search and validates roles, status and pagination', () => {
  assert.deepEqual(parseUserListQuery({ search: '  nombre  ', role: 'OPERATOR', status: 'disabled', page: '2' }), {
    search: 'nombre', role: 'OPERATOR', status: 'disabled', page: 2, pageSize: 20,
  });
  for (const query of [
    { search: ['a', 'b'] }, { search: 'a'.repeat(121) }, { role: 'SUPERADMIN' },
    { role: ['ADMIN', 'OPERATOR'] }, { status: 'pending' }, { page: '0' },
    { page: '2x' }, { page: '100001' }, { pageSize: '51' }, { pageSize: '-1' },
  ]) assert.throws(() => parseUserListQuery(query), BadRequestException);
});

test('user directory returns bounded summaries without external identities or internal fields', async () => {
  const record = { id: 'user-1', email: 'demo@example.invalid', displayName: 'Usuario de prueba', role: 'CUSTOMER', enabled: false };
  let window = { skip: 0, take: 0 };
  const service = new UsersService({ user: {
    findMany: async (query: typeof window) => {
      window = query;
      return [{ ...record, externalAuthId: 'private-subject', createdAt: new Date() }];
    },
    count: async () => 21,
  } } as unknown as PrismaService);
  const result = await service.list(parseUserListQuery({ page: '2' }));
  assert.equal(window.skip, 20);
  assert.equal(window.take, 20);
  assert.deepEqual(result, { items: [record], page: 2, pageSize: 20, total: 21, totalPages: 2 });
});

test('empty directory returns no fabricated users and database failures return safe 503', async () => {
  const service = new UsersService({ user: { findMany: async () => [], count: async () => 0 } } as unknown as PrismaService);
  assert.deepEqual(await service.list(parseUserListQuery({})), { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const unavailable = new UsersService({ user: {
    findMany: async () => { throw new Error('private database detail'); }, count: async () => 0,
  } } as unknown as PrismaService);
  await assert.rejects(unavailable.list(parseUserListQuery({})), (error: unknown) => {
    assert(error instanceof ServiceUnavailableException);
    assert.doesNotMatch(JSON.stringify(error.getResponse()), /private database detail/);
    return true;
  });
});
