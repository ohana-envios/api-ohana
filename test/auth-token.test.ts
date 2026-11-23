import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyAccessToken } from '../src/auth/auth-token.service.js';
import { AuthTokenService } from '../src/auth/auth-token.service.js';
import { ConfigService } from '@nestjs/config';

const issuer = 'https://ohana-test.zitadel.cloud';
const projectId = '123456789';
const webClientId = '987654321@ohana';
const active = { active: true, iss: issuer, aud: [projectId], client_id: webClientId, sub: 'test-user', exp: Math.floor(Date.now() / 1000) + 300, token_type: 'Bearer' };

function mock(claims: unknown, status = 200): typeof fetch {
  return (async (url, init) => {
    assert.equal(url, `${issuer}/oauth/v2/introspect`);
    assert.equal(init?.method, 'POST');
    assert.equal((init?.body as URLSearchParams).get('token'), 'access-token');
    assert.equal((init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('api-client:api-secret').toString('base64')}`);
    return new Response(JSON.stringify(claims), { status });
  }) as typeof fetch;
}

const verify = (claims: unknown, status?: number) => verifyAccessToken('access-token', issuer, projectId, 'api-client', 'api-secret', [webClientId], mock(claims, status));

test('accepts active introspected access token from the expected web client and project', async () => {
  assert.deepEqual(await verify(active), { sub: 'test-user' });
});

test('rejects inactive, expired, wrong-project and wrong-client tokens', async () => {
  for (const claims of [
    { ...active, active: false },
    { ...active, exp: 1 },
    { ...active, aud: ['other-project'] },
    { ...active, client_id: 'other-client' },
    { ...active, token_type: 'ID' },
  ]) await assert.rejects(verify(claims), /Invalid access token/);
});

test('fails closed when introspection is unavailable', async () => {
  await assert.rejects(verify({}, 503), /Authentication unavailable/);
  await assert.rejects(verifyAccessToken('access-token', issuer, projectId, 'api-client', 'api-secret', [webClientId], (() => Promise.reject(new Error('offline'))) as typeof fetch), /Authentication unavailable/);
});

test('configured mobile clients are accepted alongside web clients while other clients remain rejected', async () => {
  const values: Record<string, string> = {
    ZITADEL_ISSUER_URL: issuer, ZITADEL_PROJECT_ID: projectId,
    ZITADEL_API_CLIENT_ID: 'api-client', ZITADEL_API_CLIENT_SECRET: 'api-secret',
    ZITADEL_WEB_CLIENT_IDS: webClientId, ZITADEL_MOBILE_CLIENT_IDS: 'mobile@ohana',
  };
  const service = new AuthTokenService(new ConfigService(values));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = mock({ ...active, client_id: 'mobile@ohana' });
    assert.deepEqual(await service.verify('access-token'), { sub: 'test-user' });
    globalThis.fetch = mock({ ...active, client_id: webClientId });
    assert.deepEqual(await service.verify('access-token'), { sub: 'test-user' });
    globalThis.fetch = mock({ ...active, client_id: 'unknown@ohana' });
    await assert.rejects(service.verify('access-token'), /Invalid access token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
