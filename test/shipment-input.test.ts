import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShipmentInput } from '../src/shipments/shipment-input.js';

const address = { label: '', street: '18 de Julio', number: '123', locality: 'Montevideo', department: 'Montevideo', reference: '', notes: '' };
const valid = { customerId: 'customer1', recipientName: ' Ana ', recipientPhone: ' 099 123 456 ', pickup: { kind: 'new', address, save: false }, delivery: address, packageDescription: 'Caja', requestedPickupAt: '', notes: '' };

test('parses shipment data and retains a new pickup address', () => {
  const parsed = parseShipmentInput(valid);
  assert.equal(parsed.recipientName, 'Ana');
  assert.equal(parsed.pickup.kind, 'new');
  assert.equal(parsed.recipientPhone, '099 123 456');
});

test('accepts optional delivery schedule and rejects delivery before pickup', () => {
  assert.equal(parseShipmentInput({ ...valid, requestedDeliveryAt: '2026-11-22T15:00:00Z' }).requestedDeliveryAt?.toISOString(), '2026-11-22T15:00:00.000Z');
  assert.equal(parseShipmentInput(valid).requestedDeliveryAt, null);
  assert.throws(() => parseShipmentInput({ ...valid, requestedPickupAt: '2026-11-22T15:00:00Z', requestedDeliveryAt: '2026-11-21T15:00:00Z' }));
});

test('rejects invalid addresses, unexpected fields and invalid pickup selections', () => {
  for (const value of [null, { ...valid, customerId: '' }, { ...valid, recipientName: '' }, { ...valid, recipientPhone: '' }, { ...valid, recipientPhone: 'abc' }, { ...valid, packageDescription: '' }, { ...valid, delivery: { ...address, street: '' } }, { ...valid, pickup: { kind: 'saved', id: '' } }, { ...valid, status: 'DELIVERED' }, { ...valid, requestedPickupAt: 'not a date' }]) {
    assert.throws(() => parseShipmentInput(value));
  }
});
