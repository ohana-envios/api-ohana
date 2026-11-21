import { BadRequestException } from '@nestjs/common';
import { operationalRoles, type UserListQuery } from './users.types.js';

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new BadRequestException('Paginación inválida');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new BadRequestException('Paginación fuera de rango');
  return parsed;
}

export function parseUserListQuery(query: Record<string, unknown>): UserListQuery {
  if (query.search !== undefined && typeof query.search !== 'string') throw new BadRequestException('La búsqueda debe ser texto');
  const search = (query.search ?? '').toString().trim();
  if (search.length > 120) throw new BadRequestException('La búsqueda admite hasta 120 caracteres');
  const role = query.role ?? 'all';
  if (typeof role !== 'string' || (role !== 'all' && !(operationalRoles as readonly string[]).includes(role))) {
    throw new BadRequestException('Rol inválido');
  }
  const status = query.status ?? 'all';
  if (status !== 'all' && status !== 'enabled' && status !== 'disabled') throw new BadRequestException('Estado de acceso inválido');
  return {
    search, role: role as UserListQuery['role'], status,
    page: positiveInteger(query.page, 1, 100000), pageSize: positiveInteger(query.pageSize, 20, 50),
  };
}
