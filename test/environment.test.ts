import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCorsOrigins, validateEnvironment } from '../src/config/environment.js';

test('required database configuration is rejected', () => {
  assert.throws(() => validateEnvironment({}), /DATABASE_URL is required/);
  assert.throws(
    () => validateEnvironment({ DATABASE_URL: 'https://example.com' }),
    /PostgreSQL URL/,
  );
});

test('valid configuration is normalized and CORS origins are checked', () => {
  const config = validateEnvironment({
    DATABASE_URL: 'postgresql://localhost:5432/ohana_test',
    PORT: '3100',
    CORS_ORIGINS: 'http://localhost:5173,https://example.com',
  });
  assert.equal(config.PORT, 3100);
  assert.deepEqual(parseCorsOrigins(String(config.CORS_ORIGINS)), [
    'http://localhost:5173',
    'https://example.com',
  ]);
  assert.throws(() => parseCorsOrigins('https://example.com/path'), /Invalid CORS origin/);
});

test('Auth0 issuer and audience are paired and production requires them', () => {
  const database = { DATABASE_URL: 'postgresql://localhost:5432/ohana_test' };
  assert.throws(() => validateEnvironment({ ...database, AUTH0_AUDIENCE: 'ohana-api' }), /configured together/);
  assert.throws(() => validateEnvironment({ ...database, NODE_ENV: 'production' }), /required in production/);
  assert.throws(() => validateEnvironment({ ...database, AUTH0_ISSUER_BASE_URL: 'http://example.com', AUTH0_AUDIENCE: 'ohana-api' }), /HTTPS origin/);
  const config = validateEnvironment({ ...database, AUTH0_ISSUER_BASE_URL: 'https://ohana-test.auth0.com', AUTH0_AUDIENCE: 'ohana-api' });
  assert.equal(config.AUTH0_ISSUER_BASE_URL, 'https://ohana-test.auth0.com/');
});
