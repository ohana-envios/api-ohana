import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifiedRegistrationIdentity } from '../src/registrations/verified-identity.js';

const issuer = 'https://identity.example.test';
const claims = { sub: 'subject-1', email: '  Person@Example.COM  ', email_verified: true };
const response = (value: unknown, status = 200): typeof fetch => (async (url, init) => {
  assert.equal(url, `${issuer}/oidc/v1/userinfo`);
  assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token');
  return new Response(JSON.stringify(value), { status });
}) as typeof fetch;

test('registration derives a normalized email from the verified subject', async () => {
  assert.deepEqual(await verifiedRegistrationIdentity(issuer, 'token', 'subject-1', response(claims)),
    { subject: 'subject-1', email: 'person@example.com' });
});

test('registration rejects absent, unverified, malformed or mismatched identity claims', async () => {
  for (const value of [
    { ...claims, sub: 'different' }, { ...claims, email_verified: false },
    { ...claims, email_verified: 'true' }, { ...claims, email: '' },
    { ...claims, email: 'not-an-email' }, { ...claims, email: 'a@b.c\nother@example.com' },
  ]) await assert.rejects(verifiedRegistrationIdentity(issuer, 'token', 'subject-1', response(value)), /Verified identity required/);
});

test('registration fails closed without exposing an upstream failure', async () => {
  for (const request of [response({}, 500), (async () => { throw new Error('upstream secret'); }) as typeof fetch,
    (async () => new Response('bad json')) as typeof fetch]) {
    await assert.rejects(verifiedRegistrationIdentity(issuer, 'token', 'subject-1', request), /Identity service unavailable/);
  }
});
