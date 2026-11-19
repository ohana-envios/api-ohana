import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

test('an administrator can disable an enabled historical customer without an approval record', async () => {
  const target = { id: 'legacy', email: 'legacy@example.invalid', displayName: 'Cliente', role: 'CUSTOMER', enabled: true, externalAuthId: 'subject' };
  let audit: unknown;
  const tx = { $executeRaw: async () => 1, $queryRaw: async () => [], user: {
    findUnique: async ({ where }: { where: { id: string } }) => where.id === 'admin' ? { id: 'admin', role: 'ADMIN', enabled: true } : target,
    update: async () => ({ ...target, enabled: false }),
  }, customerRegistration: { findUnique: async () => null }, userAccessAudit: { create: async ({ data }: { data: unknown }) => { audit = data; return { actorUserId: 'admin', occurredAt: new Date(0), previousRole: 'CUSTOMER', previousEnabled: true, nextRole: 'CUSTOMER', nextEnabled: false }; } } };
  const service = new UsersService({ $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService);
  const result = await service.updateAccess('admin', 'legacy', { role: 'CUSTOMER', enabled: false, expected: { role: 'CUSTOMER', enabled: true } });
  assert.equal(result.user.enabled, false);
  assert.deepEqual(audit, { actorUserId: 'admin', targetUserId: 'legacy', previousRole: 'CUSTOMER', previousEnabled: true, nextRole: 'CUSTOMER', nextEnabled: false });
});
