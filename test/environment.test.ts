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
