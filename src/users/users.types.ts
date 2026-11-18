import type { UserRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../auth/access-token.guard.js';

export const operationalRoles = ['ADMIN', 'OPERATOR', 'CUSTOMER', 'COURIER'] as const satisfies readonly UserRole[];

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
};

export type OperationalUser = UserSummary & { enabled: true };

export type UserListQuery = {
  search: string;
  role: 'all' | UserRole;
  status: 'all' | 'enabled' | 'disabled';
  page: number;
  pageSize: number;
};

export type UserList = { items: UserSummary[]; page: number; pageSize: number; total: number; totalPages: number };

export type OperationalUserRequest = AuthenticatedRequest & { currentUser?: OperationalUser };
