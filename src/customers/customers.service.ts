import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CustomerDetail, CustomerList, CustomerListQuery, CustomerSummary } from './customers.types.js';

const customerFields = {
  id: true, type: true, displayName: true, legalName: true,
  documentType: true, documentNumber: true, email: true, phone: true, enabled: true,
} as const satisfies Prisma.CustomerSelect;

const addressFields = {
  id: true, label: true, street: true, number: true, locality: true,
  department: true, reference: true, notes: true,
} as const satisfies Prisma.AddressSelect;

type CustomerRecord = Prisma.CustomerGetPayload<{ select: typeof customerFields }>;

function summary(record: CustomerRecord, addressCount: number): CustomerSummary {
  return {
    id: record.id, type: record.type, displayName: record.displayName,
    legalName: record.legalName, documentType: record.documentType,
    documentNumber: record.documentNumber, email: record.email, phone: record.phone,
    enabled: record.enabled, addressCount,
  };
}

/** Administrative reads only. The future HTTP boundary must enforce authorization. */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerListQuery): Promise<CustomerList> {
    const where: Prisma.CustomerWhereInput = {};
    if (query.status !== 'all') where.enabled = query.status === 'enabled';
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { displayName: contains }, { legalName: contains }, { documentNumber: contains },
        { email: contains }, { phone: contains },
      ];
    }
    const [records, total] = await Promise.all([
      this.prisma.customer.findMany({
        where, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        select: { ...customerFields, _count: { select: { addresses: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items: records.map((record) => summary(record, record._count.addresses)),
      page: query.page, pageSize: query.pageSize, total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async get(id: string): Promise<CustomerDetail> {
    const record = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        ...customerFields,
        addresses: { select: addressFields, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!record) throw new NotFoundException('Cliente no encontrado');
    return {
      ...summary(record, record.addresses.length),
      addresses: record.addresses.map((address) => ({
        id: address.id, label: address.label, street: address.street, number: address.number,
        locality: address.locality, department: address.department,
        reference: address.reference, notes: address.notes,
      })),
    };
  }
}
