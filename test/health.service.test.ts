import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from '../src/health/health.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

test('health succeeds only after a database query', async () => {
  let queried = false;
  const prisma = {
    $queryRaw: async () => {
      queried = true;
      return [{ '?column?': 1 }];
    },
  } as unknown as PrismaService;

  const result = await new HealthService(prisma).check();
  assert.equal(queried, true);
  assert.deepEqual(result, { status: 'ok', database: 'up' });
});

test('health returns a safe 503 when the database query fails', async () => {
  const prisma = {
    $queryRaw: async () => { throw new Error('private connection detail'); },
  } as unknown as PrismaService;

  await assert.rejects(
    new HealthService(prisma).check(),
    (error: unknown) => {
      assert(error instanceof ServiceUnavailableException);
      assert.equal(error.getStatus(), 503);
      assert.equal(error.message, 'Database unavailable');
      assert.doesNotMatch(JSON.stringify(error.getResponse()), /private connection detail/);
      return true;
    },
  );
});
