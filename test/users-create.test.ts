import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInternalUser } from '../src/users/users.create.js';

test('accepts only valid internal roles and normalizes the email', () => {
  assert.deepEqual(parseInternalUser({ displayName: ' Ana ', email: ' ANA@Example.com ', role: 'OPERATOR' }), { displayName: 'Ana', email: 'ana@example.com', role: 'OPERATOR' });
  for (const role of ['ADMIN', 'OPERATOR', 'COURIER']) assert.equal(parseInternalUser({ displayName: 'Ana', email: 'ana@example.com', role }).role, role);
});
test('rejects external identity, customer roles and malformed inputs', () => {
  for (const input of [
    { displayName: 'Ana', email: 'ana@example.com', role: 'CUSTOMER' },
    { displayName: 'Ana', email: 'bad', role: 'ADMIN' },
    { displayName: '', email: 'ana@example.com', role: 'ADMIN' },
    { displayName: 'Ana', email: 'ana@example.com', role: 'ADMIN', externalAuthId: 'anything' },
    { displayName: 'Ana', email: 'ana@example.com', role: 'ADMIN', enabled: true },
  ]) assert.throws(() => parseInternalUser(input));
});
