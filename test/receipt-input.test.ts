import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReceipt } from '../src/shipments/receipt-input.js';

test('accepts allowed file signatures and rejects spoofed or oversized uploads', () => {
  const pdf = Buffer.from('%PDF-1.7 example');
  assert.equal(parseReceipt({ buffer: pdf, mimetype: 'application/pdf', size: pdf.length })?.size, pdf.length);
  assert.equal(parseReceipt(undefined), undefined);
  assert.throws(() => parseReceipt({ buffer: pdf, mimetype: 'image/png', size: pdf.length }));
  assert.throws(() => parseReceipt({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'application/pdf', size: 5 * 1024 * 1024 + 1 }));
});
