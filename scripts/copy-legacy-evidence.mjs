import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import pg from 'pg';

const directory = process.env.OHANA_EVIDENCE_DIR?.trim();
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply') || !directory || !isAbsolute(directory) || !process.env.DATABASE_URL) throw new Error('Configurar DATABASE_URL y OHANA_EVIDENCE_DIR; usar --apply para copiar');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const specs = [
  { kind: 'CUSTODY', table: 'CustodyEvidence', data: 'data', media: 'mediaType', size: 'size' },
  { kind: 'RECEIPT', table: 'ShipmentReceipt', data: 'data', media: 'mediaType', size: 'size' },
  { kind: 'RECEIPT_HISTORY', table: 'ShipmentReceiptHistory', data: 'oldData', media: 'oldMediaType', size: 'oldSize' },
];
const result = { scanned: 0, copied: 0, verified: 0, pending: 0, failed: 0 };
await db.connect();
try {
  if (apply) await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const spec of specs) {
    let cursor = '';
    for (;;) {
      // Table and column names come only from the fixed list above, not from user input.
      const rows = await db.query(`SELECT "id", "${spec.data}" AS data, "${spec.media}" AS media, "${spec.size}" AS size FROM "${spec.table}" WHERE "id" > $1 ORDER BY "id" LIMIT 1`, [cursor]);
      if (!rows.rowCount) break;
      const item = rows.rows[0]; cursor = item.id; result.scanned++;
      if (!Buffer.isBuffer(item.data) || item.data.length !== item.size || !item.size) { result.failed++; continue; }
      const hash = createHash('sha256').update(item.data).digest('hex');
      const found = await db.query('SELECT "storageKey", "size", "mediaType" FROM "LegacyFileCopy" WHERE "sourceKind" = $1 AND "sourceId" = $2 AND "sourceSha256" = $3', [spec.kind, item.id, hash]);
      if (found.rowCount) {
        const ref = found.rows[0];
        if (!/^[0-9a-f-]{36}$/.test(ref.storageKey) || ref.size !== item.size || ref.mediaType !== item.media) { result.failed++; continue; }
        try { const copy = await readFile(join(directory, ref.storageKey)); if (copy.length !== item.size || createHash('sha256').update(copy).digest('hex') !== hash) throw new Error('integrity'); result.verified++; } catch { result.failed++; }
        continue;
      }
      if (!apply) { result.pending++; continue; }
      const key = randomUUID();
      const handle = await open(join(directory, key), 'wx', 0o600);
      try { await handle.writeFile(item.data); await handle.sync(); } finally { await handle.close(); }
      const copy = await readFile(join(directory, key));
      if (copy.length !== item.size || createHash('sha256').update(copy).digest('hex') !== hash) { result.failed++; continue; }
      const inserted = await db.query('INSERT INTO "LegacyFileCopy" ("id", "sourceKind", "sourceId", "sourceSha256", "storageKey", "mediaType", "size") VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ("sourceKind", "sourceId", "sourceSha256") DO NOTHING', [randomUUID(), spec.kind, item.id, hash, key, item.media, item.size]);
      if (inserted.rowCount) result.copied++; else result.pending++;
    }
  }
  process.stdout.write(JSON.stringify({ mode: apply ? 'copy' : 'dry-run', ...result }, null, 2) + '\n');
  if (result.failed || (apply && result.pending)) process.exitCode = 1;
} finally { await db.end(); }
