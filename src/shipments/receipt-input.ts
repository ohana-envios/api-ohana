import { BadRequestException } from '@nestjs/common';

export type ReceiptFile = { buffer: Buffer; mimetype: string; size: number };
export function parseReceipt(file: ReceiptFile | undefined): ReceiptFile | undefined {
  if (!file) return undefined;
  if (!Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size === 0 || file.size > 5 * 1024 * 1024) throw new BadRequestException('El comprobante debe pesar hasta 5 MB.');
  const valid = (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) ||
    (file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mimetype === 'image/jpeg' && file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])));
  if (!valid) throw new BadRequestException('El comprobante debe ser PDF, PNG o JPG válido.');
  return file;
}
