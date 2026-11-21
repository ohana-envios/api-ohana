import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCourierDetails, parseCourierWrite } from '../src/couriers/courier-input.js';

const valid = { available: true, vehicle: ' Bicicleta ', capacity: ' 2 paquetes ', workingHours: ' 9 a 17 ', notes: ' ' };

test('normalizes courier planning information without inventing optional data', () => {
  assert.deepEqual(parseCourierDetails(valid), { available: true, vehicle: 'Bicicleta', capacity: '2 paquetes', workingHours: '9 a 17', notes: null });
});

test('requires a name and a version when editing a courier', () => {
  assert.equal(parseCourierWrite({ ...valid, displayName: '  Ana  ', active: true, version: 2 }, true).displayName, 'Ana');
  assert.throws(() => parseCourierWrite({ ...valid, displayName: ' ', active: true }, false));
  assert.throws(() => parseCourierWrite({ ...valid, displayName: 'Ana', active: true, version: 0 }, true));
  assert.throws(() => parseCourierWrite({ ...valid, displayName: 'Ana', active: true, role: 'ADMIN' }, false));
});

test('rejects invalid and unexpected courier fields', () => {
  for (const value of [null, [], { ...valid, available: 'true' }, { ...valid, vehicle: 3 }, { ...valid, vehicle: 'x'.repeat(121) }, { ...valid, role: 'ADMIN' }]) {
    assert.throws(() => parseCourierDetails(value));
  }
});
