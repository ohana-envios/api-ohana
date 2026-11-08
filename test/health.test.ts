import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function createApp(query: () => Promise<unknown>): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [HealthModule],
    providers: [PrismaService],
  })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: query })
    .compile();

  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

test('GET /api/health confirms a successful database query', async () => {
  const server = (await createApp(async () => [{ '?column?': 1 }])).getHttpServer();
  const response = await request(server).get('/api/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', database: 'up' });
});

test('GET /api/health reports database failure without leaking details', async () => {
  const server = (await createApp(async () => { throw new Error('private connection detail'); })).getHttpServer();
  const response = await request(server).get('/api/health').expect(503);
  assert.equal(response.body.message, 'Database unavailable');
  assert.doesNotMatch(JSON.stringify(response.body), /private connection detail/);
});
