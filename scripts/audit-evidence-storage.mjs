import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import pg from 'pg';

const directory = process.env.OHANA_EVIDENCE_DIR?.trim();
if (!directory || !isAbsolute(directory) || !process.env.DATABASE_URL) throw new Error('Configurar DATABASE_URL y OHANA_EVIDENCE_DIR con ruta absoluta');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const rows = await db.query(`SELECT "storageKey", "sha256", "size" FROM "DeliveryEvidence" UNION ALL SELECT "storageKey", "sha256", "size" FROM "IncidentEvidence" UNION ALL SELECT "storageKey", "sha256", "size" FROM "EventEvidence" UNION ALL SELECT "storageKey", "sourceSha256" AS "sha256", "size" FROM "LegacyFileCopy"`);
  const existing = new Set(await readdir(directory));
  const keys = new Set(); let missing = 0; let altered = 0;
  for (const item of rows.rows) {
    const key = item.storageKey;
    if (!/^[0-9a-f-]{36}$/.test(key)) { altered++; continue; }
    keys.add(key);
    if (!existing.has(key)) { missing++; continue; }
    const data = await readFile(join(directory, key));
    if (data.length !== item.size || createHash('sha256').update(data).digest('hex') !== item.sha256) altered++;
  }
  const orphan = [...existing].filter((key) => /^[0-9a-f-]{36}$/.test(key) && !keys.has(key)).length;
  const legacy = await db.query('SELECT (SELECT COUNT(*) FROM "CustodyEvidence") AS custody, (SELECT COUNT(*) FROM "ShipmentReceipt") AS receipts, (SELECT COUNT(*) FROM "ShipmentReceiptHistory") AS receipt_history');
  process.stdout.write(JSON.stringify({ referenced: rows.rowCount, missing, altered, orphan, legacy: legacy.rows[0] }, null, 2) + '\n');
  if (missing || altered) process.exitCode = 1;
} finally { await db.end(); }
