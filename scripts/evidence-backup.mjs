import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, copyFile, lstat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';

const [mode, backupArg, restoreArg] = process.argv.slice(2);
if (!['backup', 'verify', 'restore-test'].includes(mode) || !backupArg || !isAbsolute(backupArg)) throw new Error('Uso: backup|verify <carpeta absoluta nueva> o restore-test <respaldo> <carpeta destino nueva>');
const backup = resolve(backupArg);
const evidenceDir = process.env.OHANA_EVIDENCE_DIR?.trim();
async function hash(path) { const h = createHash('sha256'); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest('hex'); }
function pgEnvironment(connectionString) {
  const url = new URL(connectionString); if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('Conexión PostgreSQL inválida');
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), ...(url.searchParams.has('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}) };
}
async function run(command, args, env) { await new Promise((res, rej) => { const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); let err = ''; child.stderr.on('data', (x) => { err += x.toString().slice(0, 4000); }); child.on('error', rej); child.on('close', (code) => code === 0 ? res() : rej(new Error(`Falló ${command}: ${err}`))); }); }
async function verify() {
  const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || typeof manifest.dumpSha256 !== 'string') throw new Error('Manifiesto inválido');
  if (await hash(join(backup, 'database.dump')) !== manifest.dumpSha256) throw new Error('El respaldo de base no coincide');
  const seen = new Set();
  for (const item of manifest.files) {
    if (!/^[0-9a-f-]{36}$/.test(item.name) || seen.has(item.name) || !/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error('Archivo del manifiesto inválido');
    seen.add(item.name); const path = join(backup, 'evidence', item.name); const st = await lstat(path);
    if (!st.isFile() || st.isSymbolicLink() || st.size !== item.size || await hash(path) !== item.sha256) throw new Error('Una evidencia no coincide con el respaldo');
  }
  const entries = await readdir(join(backup, 'evidence')); if (entries.length !== seen.size || entries.some((name) => !seen.has(name))) throw new Error('Hay archivos no declarados en el respaldo');
  return manifest;
}
if (mode === 'backup') {
  if (!process.env.DATABASE_URL || !evidenceDir || !isAbsolute(evidenceDir)) throw new Error('Configurar DATABASE_URL y OHANA_EVIDENCE_DIR');
  const source = resolve(evidenceDir); if (backup === source || backup.startsWith(source + sep) || source.startsWith(backup + sep)) throw new Error('El respaldo debe estar fuera del almacenamiento');
  await mkdir(backup, { recursive: false, mode: 0o700 }); await mkdir(join(backup, 'evidence'), { mode: 0o700 });
  await run(process.env.OHANA_PG_DUMP || 'pg_dump', ['--format=custom', '--file', join(backup, 'database.dump')], pgEnvironment(process.env.DATABASE_URL));
  const files = [];
  for (const name of await readdir(source)) {
    if (!/^[0-9a-f-]{36}$/.test(name)) throw new Error('El almacenamiento contiene una entrada inesperada');
    const path = join(source, name); const st = await lstat(path); if (!st.isFile() || st.isSymbolicLink()) throw new Error('Entrada no permitida en almacenamiento');
    const dest = join(backup, 'evidence', name); await copyFile(path, dest, 1); const destStat = await lstat(dest);
    files.push({ name, size: destStat.size, sha256: await hash(dest) });
  }
  // References are append-only. Checking the live database after the dump detects missing
  // objects for the dump and any evidence committed while the backup was running.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  try {
    const refs = await db.query(`SELECT "storageKey", "sha256", "size" FROM "DeliveryEvidence" UNION ALL SELECT "storageKey", "sha256", "size" FROM "IncidentEvidence" UNION ALL SELECT "storageKey", "sha256", "size" FROM "EventEvidence" UNION ALL SELECT "storageKey", "sourceSha256" AS "sha256", "size" FROM "LegacyFileCopy"`);
    const copied = new Map(files.map((item) => [item.name, item]));
    for (const ref of refs.rows) { const file = copied.get(ref.storageKey); if (!file || file.sha256 !== ref.sha256 || file.size !== ref.size) throw new Error('Falta o no coincide un archivo referido por la base'); }
  } finally { await db.end(); }
  const manifest = { version: 1, createdAt: new Date().toISOString(), dumpSha256: await hash(join(backup, 'database.dump')), files };
  await writeFile(join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  await verify(); process.stdout.write(`Respaldo verificado: ${files.length} archivos\n`);
} else if (mode === 'verify') {
  const manifest = await verify(); process.stdout.write(`Respaldo válido: ${manifest.files.length} archivos\n`);
} else {
  if (!restoreArg || !isAbsolute(restoreArg) || !process.env.OHANA_RESTORE_DATABASE_URL) throw new Error('Se requiere carpeta nueva y OHANA_RESTORE_DATABASE_URL de prueba');
  const url = new URL(process.env.OHANA_RESTORE_DATABASE_URL); const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname) || !/^ohana_isolated_[a-z0-9_]+$/.test(dbName)) throw new Error('Solo se permite restaurar a una base local aislada ohana_isolated_*');
  const destination = resolve(restoreArg);
  if (destination === backup || destination.startsWith(backup + sep) || backup.startsWith(destination + sep) || (evidenceDir && (destination === resolve(evidenceDir) || destination.startsWith(resolve(evidenceDir) + sep)))) throw new Error('Destino de archivos inválido');
  const manifest = await verify();
  const client = new pg.Client({ connectionString: process.env.OHANA_RESTORE_DATABASE_URL }); await client.connect();
  try { const existing = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')"); if (existing.rows[0].count !== 0) throw new Error('La base de prueba debe estar vacía'); } finally { await client.end(); }
  await mkdir(destination, { recursive: false, mode: 0o700 });
  await run(process.env.OHANA_PG_RESTORE || 'pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', dbName, join(backup, 'database.dump')], pgEnvironment(process.env.OHANA_RESTORE_DATABASE_URL));
  for (const file of manifest.files) await copyFile(join(backup, 'evidence', file.name), join(destination, file.name), 1);
  process.stdout.write(`Restauración de prueba completada: ${manifest.files.length} archivos\n`);
}
