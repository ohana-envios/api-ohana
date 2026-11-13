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

test('ZITADEL issuer, project and clients are paired and production requires them', () => {
  const database = { DATABASE_URL: 'postgresql://localhost:5432/ohana_test' };
  assert.throws(() => validateEnvironment({ ...database, ZITADEL_PROJECT_ID: '123' }), /configured together/);
  assert.throws(() => validateEnvironment({ ...database, NODE_ENV: 'production' }), /required in production/);
  assert.throws(() => validateEnvironment({ ...database, ZITADEL_ISSUER_URL: 'http://example.com', ZITADEL_PROJECT_ID: '123', ZITADEL_WEB_CLIENT_IDS: '456@ohana', ZITADEL_API_CLIENT_ID: 'api@ohana', ZITADEL_API_CLIENT_SECRET: 'secret' }), /HTTPS origin/);
  assert.throws(() => validateEnvironment({ ...database, ZITADEL_ISSUER_URL: 'https://example.com', ZITADEL_PROJECT_ID: 'not-a-project', ZITADEL_WEB_CLIENT_IDS: '456@ohana', ZITADEL_API_CLIENT_ID: 'api@ohana', ZITADEL_API_CLIENT_SECRET: 'secret' }), /numeric project ID/);
  const config = validateEnvironment({ ...database, ZITADEL_ISSUER_URL: 'https://ohana-test.zitadel.cloud/', ZITADEL_PROJECT_ID: '123', ZITADEL_WEB_CLIENT_IDS: '456@ohana, 789@ohana', ZITADEL_API_CLIENT_ID: 'api@ohana', ZITADEL_API_CLIENT_SECRET: 'secret' });
  assert.equal(config.ZITADEL_ISSUER_URL, 'https://ohana-test.zitadel.cloud');
  assert.equal(config.ZITADEL_WEB_CLIENT_IDS, '456@ohana,789@ohana');
});
