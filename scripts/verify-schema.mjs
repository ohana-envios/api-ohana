import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const names = new Set(tables.rows.map((row) => row.table_name));
  for (const name of ['User', 'Customer', 'Address', 'Shipment', 'Package', 'ShipmentEvent']) {
    assert(names.has(name), `Missing table ${name}`);
  }

  const constraints = await client.query(`
    SELECT conname, contype, confdeltype FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `);
  const byName = new Map(constraints.rows.map((row) => [row.conname, row]));
  for (const name of [
    'Address_customerId_fkey',
    'Shipment_customerId_fkey',
    'Shipment_createdByUserId_fkey',
    'Package_shipmentId_fkey',
    'ShipmentEvent_shipmentId_fkey',
    'ShipmentEvent_actorUserId_fkey',
  ]) {
    const constraint = byName.get(name);
    assert(constraint, `Missing foreign key ${name}`);
    assert.equal(constraint.confdeltype, 'r', `${name} must restrict deletion`);
  }
  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `);
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));
  for (const name of [
    'User_externalAuthId_key',
    'User_email_key',
    'Shipment_code_key',
    'Package_shipmentId_sequence_key',
    'Shipment_customerId_createdAt_idx',
    'Shipment_status_priority_createdAt_idx',
    'ShipmentEvent_shipmentId_occurredAt_idx',
  ]) {
    assert(indexNames.has(name), `Missing index ${name}`);
  }

  const triggers = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = '"ShipmentEvent"'::regclass AND NOT tgisinternal
  `);
  assert(triggers.rows.some((row) => row.tgname === 'ShipmentEvent_append_only'));

  // A rolled-back scenario checks the address snapshot, restrictive FK and event immutability.
  await client.query('BEGIN');
  try {
    const customerId = randomUUID();
    const addressId = randomUUID();
    const shipmentId = randomUUID();
    const eventId = randomUUID();
    await client.query(
      'INSERT INTO "Customer" ("id", "type", "displayName", "updatedAt") VALUES ($1, $2, $3, NOW())',
      [customerId, 'PERSON', 'Cliente de prueba'],
    );
    await client.query(
      'INSERT INTO "Address" ("id", "customerId", "street", "number", "locality", "department", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [addressId, customerId, 'Calle original', '12', 'Montevideo', 'Montevideo'],
    );
    await client.query(
      `INSERT INTO "Shipment" (
        "id", "code", "customerId", "senderName", "recipientName",
        "pickupStreet", "pickupNumber", "pickupLocality", "pickupDepartment",
        "deliveryStreet", "deliveryNumber", "deliveryLocality", "deliveryDepartment", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [shipmentId, `TEST-${randomUUID()}`, customerId, 'Remitente', 'Destinatario',
        'Calle original', '12', 'Montevideo', 'Montevideo',
        'Calle destino', '45', 'Montevideo', 'Montevideo'],
    );
    await client.query(
      'UPDATE "Address" SET "street" = $1, "updatedAt" = NOW() WHERE "id" = $2',
      ['Calle modificada', addressId],
    );
    const shipment = await client.query('SELECT "pickupStreet" FROM "Shipment" WHERE "id" = $1', [shipmentId]);
    assert.equal(shipment.rows[0].pickupStreet, 'Calle original');

    await client.query('SAVEPOINT protect_customer');
    await assert.rejects(
      client.query('DELETE FROM "Customer" WHERE "id" = $1', [customerId]),
      (error) => error.code === '23503',
    );
    await client.query('ROLLBACK TO SAVEPOINT protect_customer');

    await client.query(
      'INSERT INTO "ShipmentEvent" ("id", "shipmentId", "actorLabel", "type") VALUES ($1, $2, $3, $4)',
      [eventId, shipmentId, 'Sistema', 'CREATED'],
    );
    await client.query('SAVEPOINT protect_event');
    await assert.rejects(
      client.query('UPDATE "ShipmentEvent" SET "notes" = $1 WHERE "id" = $2', ['changed', eventId]),
      /ShipmentEvent is append-only/,
    );
    await client.query('ROLLBACK TO SAVEPOINT protect_event');
  } finally {
    await client.query('ROLLBACK');
  }

  console.log('Schema verified: six tables, keys, indexes, address snapshot and append-only events.');
} finally {
  await client.end();
}
