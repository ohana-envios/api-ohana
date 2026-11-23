import { BadRequestException } from '@nestjs/common';
import type { ShipmentPriority, ShipmentStatus } from '../generated/prisma/client.js';

export type ShipmentQuery = { code: string; customer: string; recipient: string; responsible: string; status?: ShipmentStatus; priority?: ShipmentPriority; from?: Date; to?: Date; page: number };
export function parseShipmentQuery(input: Record<string, unknown>): ShipmentQuery {
  const allowed = ['code', 'customer', 'recipient', 'responsible', 'status', 'priority', 'from', 'to', 'page'];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || Object.values(input).some((value) => typeof value !== 'string')) throw new BadRequestException('Filtros inválidos');
  const value = (key: string) => ((input[key] as string | undefined) ?? '').trim();
  const code = value('code'), customer = value('customer'), recipient = value('recipient'), responsible = value('responsible');
  const status = value('status'), priority = value('priority'), pageText = value('page');
  if ([code, customer, recipient, responsible].some((v) => v.length > 120) || (status && !['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_DEPOT', 'IN_ROUTE', 'DELIVERED', 'NOT_DELIVERED', 'RESCHEDULED', 'CANCELED'].includes(status)) ||
      (priority && !['NORMAL', 'HIGH'].includes(priority)) || (pageText && !/^[1-9]\d{0,4}$/.test(pageText))) throw new BadRequestException('Filtros inválidos');
  const date = (key: string): Date | undefined => {
    const v = value(key); if (!v) return undefined;
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v) || Number.isNaN(Date.parse(v))) throw new BadRequestException('Fecha inválida');
    return new Date(v);
  };
  const from = date('from'), to = date('to');
  if (from && to && from > to) throw new BadRequestException('El inicio debe ser anterior al fin');
  return { code, customer, recipient, responsible, ...(status ? { status: status as ShipmentStatus } : {}), ...(priority ? { priority: priority as ShipmentPriority } : {}), from, to, page: pageText ? Number(pageText) : 1 };
}
