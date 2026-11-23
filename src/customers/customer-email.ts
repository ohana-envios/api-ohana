import type { Prisma } from '../generated/prisma/client.js';

/** All customer email writes must take this lock before checking and writing. */
export async function lockCustomerEmails(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 21)`;
}
export function emailKey(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}
export async function customerEmailExists(tx: Prisma.TransactionClient, email: string, excludeId = ''): Promise<boolean> {
  const found = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Customer"
    WHERE "email" IS NOT NULL AND lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${email}
      AND "id" <> ${excludeId} LIMIT 1`;
  return found.length > 0;
}
