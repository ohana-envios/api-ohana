import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAdminRegistration } from '../src/registrations/registration-input.js';

test('administrative registration normalizes contact data and permits no email', () => {
  assert.deepEqual(parseAdminRegistration({ displayName: ' Ana ', type: 'PERSON', phone: '', email: ' ANa@Example.com ' }),
    { displayName: 'Ana', type: 'PERSON', phone: null, email: 'ana@example.com' });
  assert.deepEqual(parseAdminRegistration({ displayName: 'Empresa', type: 'COMPANY', phone: ' 099 123 ', email: '' }),
    { displayName: 'Empresa', type: 'COMPANY', phone: '099 123', email: null });
});
test('administrative registration rejects invalid fields and caller-supplied state', () => {
  for (const values of [
    { displayName: '', type: 'PERSON', phone: '', email: '' },
    { displayName: 'Ana', type: 'PERSON', phone: '', email: 'wrong' },
    { displayName: 'Ana', type: 'PERSON', phone: '---', email: '' },
    { displayName: 'Ana', type: 'PERSON', phone: '', email: '', enabled: false },
  ]) assert.throws(() => parseAdminRegistration(values), /inválidos/);
});
