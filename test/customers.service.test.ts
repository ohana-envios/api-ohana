import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { CustomersService } from '../src/customers/customers.service.js';
import { parseCustomerListQuery } from '../src/customers/customers.query.js';

const customer = {
  id: 'customer-1', type: 'COMPANY', displayName: 'Librería de ejemplo',
  legalName: null, documentType: null, documentNumber: null,
  email: null, phone: '099000001', enabled: true,
};

test('customer lists expose a bounded page and a summary, without internal fields', async () => {
  let requestedPage: { skip?: number; take?: number } = {};
  const service = new CustomersService({ customer: {
    findMany: async (query: typeof requestedPage) => {
      requestedPage = query;
      return [{ ...customer, _count: { addresses: 2 }, createdAt: new Date(), internal: 'private' }];
    },
    count: async () => 21,
  } } as unknown as PrismaService);

  const result = await service.list(parseCustomerListQuery({ page: '2', pageSize: '20' }));
  assert.equal(requestedPage.skip, 20);
  assert.equal(requestedPage.take, 20);
  assert.deepEqual(result, {
    items: [{ ...customer, addressCount: 2 }],
    page: 2, pageSize: 20, total: 21, totalPages: 2,
  });
});

test('customer queries reject invalid paging and unsupported filters', () => {
  for (const query of [
    { page: '0' }, { page: '1.5' }, { page: '2abc' }, { page: '100001' },
    { pageSize: '51' }, { pageSize: '-1' }, { status: 'pending' },
    { search: ['one', 'two'] }, { search: 'a'.repeat(121) },
  ]) {
    assert.throws(() => parseCustomerListQuery(query), BadRequestException);
  }
  assert.deepEqual(parseCustomerListQuery({ search: '  Librería  ', status: 'disabled' }), {
    search: 'Librería', status: 'disabled', page: 1, pageSize: 20,
  });
});

test('an empty customer list has no fabricated records or pages', async () => {
  const service = new CustomersService({ customer: {
    findMany: async () => [], count: async () => 0,
  } } as unknown as PrismaService);
  assert.deepEqual(await service.list(parseCustomerListQuery({})), {
    items: [], page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
});

test('customer detail exposes structured addresses and only the agreed fields', async () => {
  const address = {
    id: 'address-1', label: 'Local', street: 'Calle de ejemplo', number: '123',
    locality: 'Centro', department: 'Montevideo', reference: null, notes: null,
  };
  const service = new CustomersService({ customer: {
    findUnique: async () => ({ ...customer, addresses: [{ ...address, customerId: 'customer-1' }], internal: 'private' }),
  } } as unknown as PrismaService);
  assert.deepEqual(await service.get('customer-1'), {
    ...customer, addressCount: 1, addresses: [address],
  });
});

test('a missing customer produces a not-found error', async () => {
  const service = new CustomersService({ customer: {
    findUnique: async () => null,
  } } as unknown as PrismaService);
  await assert.rejects(service.get('missing'), NotFoundException);
});
