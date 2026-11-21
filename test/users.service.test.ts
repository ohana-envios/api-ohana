import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';

const localUser = { id: 'user-1', email: 'demo@example.invalid', displayName: 'Usuario de prueba', role: 'ADMIN', enabled: true };

test('operational identity uses the verified external subject and returns only public local fields', async () => {
  let subject: string | undefined;
  const users = new UsersService({ user: {
    findUnique: async (query: { where: { externalAuthId: string } }) => {
      subject = query.where.externalAuthId;
      return { ...localUser, externalAuthId: 'verified-subject', privateField: 'hidden' };
    },
  } } as unknown as PrismaService);
  assert.deepEqual(await users.resolveEnabledUser('verified-subject'), localUser);
  assert.equal(subject, 'verified-subject');
});

test('unknown, disabled and unsupported-role identities receive the same denial', async () => {
  for (const record of [null, { ...localUser, enabled: false }, { ...localUser, role: 'UNKNOWN' }]) {
    const users = new UsersService({ user: { findUnique: async () => record } } as unknown as PrismaService);
    await assert.rejects(users.resolveEnabledUser('verified-subject'), (error: unknown) => {
      assert(error instanceof ForbiddenException);
      assert.equal(error.message, 'User access not enabled');
      return true;
    });
  }
});

test('an empty subject is rejected before any user lookup', async () => {
  const users = new UsersService({ user: {
    findUnique: async () => { throw new Error('Must not query'); },
  } } as unknown as PrismaService);
  await assert.rejects(users.resolveEnabledUser(''), UnauthorizedException);
});

test('database failure denies access without exposing internal errors', async () => {
  const users = new UsersService({ user: {
    findUnique: async () => { throw new Error('private database connection detail'); },
  } } as unknown as PrismaService);
  await assert.rejects(users.resolveEnabledUser('verified-subject'), (error: unknown) => {
    assert(error instanceof ServiceUnavailableException);
    assert.doesNotMatch(JSON.stringify(error.getResponse()), /private database/);
    return true;
  });
});
