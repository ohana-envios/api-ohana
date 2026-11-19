import { BadRequestException } from '@nestjs/common';
import type { CustomerListQuery } from './customers.types.js';

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException('La paginación debe usar enteros positivos');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new BadRequestException(`La paginación supera el límite de ${maximum}`);
  }
  return parsed;
}

export function parseCustomerListQuery(query: Record<string, unknown>): CustomerListQuery {
  if (query.search !== undefined && typeof query.search !== 'string') {
    throw new BadRequestException('La búsqueda debe ser texto');
  }
  const search = (query.search ?? '').toString().trim();
  if (search.length > 120) throw new BadRequestException('La búsqueda admite hasta 120 caracteres');
  const status = query.status ?? 'all';
  if (status !== 'all' && status !== 'enabled' && status !== 'disabled') {
    throw new BadRequestException('Estado de cliente inválido');
  }
  return {
    search, status,
    page: positiveInteger(query.page, 1, 100000),
    pageSize: positiveInteger(query.pageSize, 20, 50),
  };
}
