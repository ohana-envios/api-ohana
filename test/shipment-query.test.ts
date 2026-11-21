import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShipmentQuery } from '../src/shipments/shipment-query.js';

test('accepts combined filters and bounded pagination', () => {
  const query = parseShipmentQuery({ code: ' OH-1 ', recipient: 'Ana', status: 'PENDING', priority: 'HIGH', page: '2', from: '2026-11-21T00:00:00.000Z' });
  assert.equal(query.code, 'OH-1'); assert.equal(query.page, 2); assert.equal(query.status, 'PENDING');
  assert.equal(query.from?.toISOString(), '2026-11-21T00:00:00.000Z');
});
test('rejects invalid or unknown filters and inverted date intervals', () => {
  for (const query of [{ page: '0' }, { status: 'LOST' }, { priority: 'urgent' }, { from: 'today' }, { unknown: 'x' }, { from: '2026-11-22T00:00:00Z', to: '2026-11-21T00:00:00Z' }]) assert.throws(() => parseShipmentQuery(query));
});

test('allows filtering by every documented operational state', () => {
  for (const status of ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_DEPOT', 'IN_ROUTE', 'DELIVERED', 'NOT_DELIVERED', 'RESCHEDULED', 'CANCELED']) {
    assert.equal(parseShipmentQuery({ status }).status, status);
  }
});
