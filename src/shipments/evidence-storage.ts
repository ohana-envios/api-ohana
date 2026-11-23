import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ReceiptFile } from './receipt-input.js';

@Injectable()
export class EvidenceStorage {
  private path(key: string): string {
    const directory = process.env.OHANA_EVIDENCE_DIR?.trim();
    if (!directory || !isAbsolute(directory) || !/^[0-9a-f-]{36}$/.test(key)) throw new ServiceUnavailableException('Almacenamiento de evidencias no disponible');
    return join(directory, key);
  }
  async save(file: ReceiptFile): Promise<{ storageKey: string; sha256: string; mediaType: string; size: number }> {
    const storageKey = randomUUID(); const path = this.path(storageKey);
    try {
      await mkdir(process.env.OHANA_EVIDENCE_DIR!.trim(), { recursive: true, mode: 0o700 });
      const handle = await open(path, 'wx', 0o600);
      try { await handle.writeFile(file.buffer); await handle.sync(); } finally { await handle.close(); }
      return { storageKey, sha256: createHash('sha256').update(file.buffer).digest('hex'), mediaType: file.mimetype, size: file.size };
    } catch { throw new ServiceUnavailableException('No se pudo guardar la evidencia'); }
  }
  async read(storageKey: string, sha256: string, size: number): Promise<Buffer> {
    const path = this.path(storageKey);
    try { const data = await readFile(path); if (data.length !== size || createHash('sha256').update(data).digest('hex') !== sha256) throw new Error('Integrity check failed'); return data; }
    catch { throw new ServiceUnavailableException('No se pudo recuperar la evidencia'); }
  }
}
