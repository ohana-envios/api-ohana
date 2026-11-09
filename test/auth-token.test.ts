import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyAccessToken } from '../src/auth/auth-token.service.js';

test('validates Auth0 access token signature, issuer, audience and expiry', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', use: 'sig' };
  const keySet = createLocalJWKSet({ keys: [jwk] });
  const issuer = 'https://ohana-test.auth0.com/';
  const audience = 'https://api.ohana.test';
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('auth0|test-user')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  assert.deepEqual(await verifyAccessToken(token, keySet, issuer, audience), { sub: 'auth0|test-user' });
  await assert.rejects(verifyAccessToken(token, keySet, issuer, 'wrong-audience'), /Invalid access token/);
  await assert.rejects(verifyAccessToken(token, keySet, 'https://other.auth0.com/', audience), /Invalid access token/);

  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('auth0|test-user')
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(privateKey);
  await assert.rejects(verifyAccessToken(expired, keySet, issuer, audience), /Invalid access token/);
});
