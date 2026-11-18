import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CustomerDetail, CustomerList, CustomerListQuery, CustomerSummary } from './customers.types.js';
import { customerEmailExists, emailKey, lockCustomerEmails } from './customer-email.js';
import type { CustomerEdit } from './customers.edit.js';
import type { AddressEdit, AddressFields } from './customers.address.js';

const customerFields = {
  id: true, type: true, displayName: true, legalName: true,
  documentType: true, documentNumber: true, email: true, phone: true, enabled: true,
} as const satisfies Prisma.CustomerSelect;

const addressFields = {
  id: true, label: true, street: true, number: true, locality: true,
  department: true, reference: true, notes: true, active: true,
} as const satisfies Prisma.AddressSelect;

type CustomerRecord = Prisma.CustomerGetPayload<{ select: typeof customerFields }>;
const detailFields = { ...customerFields, addresses: { select: addressFields, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } as const satisfies Prisma.CustomerSelect;
type CustomerDetailRecord = Prisma.CustomerGetPayload<{ select: typeof detailFields }>;

function summary(record: CustomerRecord, addressCount: number): CustomerSummary {
  return {
    id: record.id, type: record.type, displayName: record.displayName,
    legalName: record.legalName, documentType: record.documentType,
    documentNumber: record.documentNumber, email: record.email, phone: record.phone,
    enabled: record.enabled, addressCount,
  };
}

function detail(record: CustomerDetailRecord): CustomerDetail {
  return {
    ...summary(record, record.addresses.length),
    addresses: record.addresses.map((address) => ({
      id: address.id, label: address.label, street: address.street, number: address.number,
      locality: address.locality, department: address.department,
      reference: address.reference, notes: address.notes, active: address.active,
    })),
  };
}

async function lockAdministrator(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
  if (!actor?.enabled || actor.role !== 'ADMIN') throw new ForbiddenException('Operation not permitted');
}

async function lockCustomerManager(tx: Prisma.TransactionClient, actorId: string, customerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true } });
  if (!actor?.enabled) throw new ForbiddenException('Operation not permitted');
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'CUSTOMER') throw new ForbiddenException('Operation not permitted');
  const registration = await tx.customerRegistration.findUnique({ where: { userId: actorId },
    select: { customerId: true, pending: true, approvedAt: true, approvedById: true, customer: { select: { enabled: true } } } });
  if (!registration || registration.customerId !== customerId || registration.pending || !registration.approvedAt || !registration.approvedById || !registration.customer.enabled)
    throw new ForbiddenException('Operation not permitted');
}

/** Administrative operations; callers must enforce authorization. */
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
      select: detailFields,
    });
    if (!record) throw new NotFoundException('Cliente no encontrado');
    return detail(record);
  }

  async getOwn(actorId: string): Promise<CustomerDetail> {
    return this.prisma.$transaction(async (tx) => {
      const registration = await tx.customerRegistration.findUnique({ where: { userId: actorId }, select: { customerId: true } });
      if (!registration) throw new ForbiddenException('Operation not permitted');
      await lockCustomerManager(tx, actorId, registration.customerId);
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: registration.customerId }, select: detailFields });
      return detail(customer);
    });
  }

  async update(id: string, data: CustomerEdit, actorId: string): Promise<CustomerDetail> {
    const { expected, ...changes } = data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockCustomerManager(tx, actorId, id);
        const nextEmail = emailKey(changes.email);
        const previousEmail = emailKey(expected.email);
        if (nextEmail && nextEmail !== previousEmail) {
          await lockCustomerEmails(tx);
          const reserved = await tx.customerRegistration.findFirst({ where: { emailKey: nextEmail, customerId: { not: id } }, select: { id: true } });
          if (reserved || await customerEmailExists(tx, nextEmail, id)) throw new ConflictException({ statusCode: 409, code: 'CUSTOMER_EMAIL_DUPLICATE', message: 'No se pudo usar ese correo.' });
        }
        const record = await tx.customer.update({ where: { id, ...expected }, data: changes, select: detailFields });
        const fields = Object.keys(changes).filter((key) => changes[key as keyof typeof changes] !== expected[key as keyof typeof expected]);
        if (fields.length) await tx.customerDataAudit.create({ data: { customerId: id, actorUserId: actorId, action: 'CUSTOMER_EDIT', fields } });
        return detail(record);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        const current = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
        if (!current) throw new NotFoundException('Cliente no encontrado');
        throw new ConflictException('La ficha cambió desde que la abriste. Volvé a cargarla antes de guardar.');
      }
      throw error;
    }
  }

  async setCustomerStatus(actorId: string, customerId: string, enabled: boolean): Promise<CustomerDetail> {
    return this.prisma.$transaction(async (tx) => {
      await lockAdministrator(tx, actorId);
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Cliente no encontrado');
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { enabled: true, registration: { select: { pending: true } } } });
      if (customer.registration?.pending) throw new ConflictException('La habilitación inicial se realiza desde solicitudes pendientes.');
      if (customer.enabled !== enabled) {
        await tx.customer.update({ where: { id: customerId }, data: { enabled } });
        await tx.customerStatusAudit.create({ data: { customerId, actorUserId: actorId, previousEnabled: customer.enabled, nextEnabled: enabled } });
      }
      const result = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: detailFields });
      return detail(result);
    });
  }

  async addAddress(customerId: string, data: AddressFields, actorId: string): Promise<CustomerDetail> {
    return this.prisma.$transaction(async (tx) => {
      await lockCustomerManager(tx, actorId, customerId);
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      const address = await tx.address.create({ data: { ...data, customerId }, select: { id: true } });
      await tx.customerDataAudit.create({ data: { customerId, addressId: address.id, actorUserId: actorId, action: 'ADDRESS_CREATE', fields: Object.keys(data) } });
      const record = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: detailFields });
      return detail(record);
    });
  }

  async updateAddress(customerId: string, addressId: string, data: AddressEdit, actorId: string): Promise<CustomerDetail> {
    const { expected, ...changes } = data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockCustomerManager(tx, actorId, customerId);
        await tx.address.update({ where: { id: addressId, customerId, ...expected }, data: changes });
        const fields = Object.keys(changes).filter((key) => changes[key as keyof typeof changes] !== expected[key as keyof typeof expected]);
        if (fields.length) await tx.customerDataAudit.create({ data: { customerId, addressId, actorUserId: actorId, action: 'ADDRESS_EDIT', fields } });
        const record = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: detailFields });
        return detail(record);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        const current = await this.prisma.address.findFirst({ where: { id: addressId, customerId }, select: { id: true } });
        if (!current) throw new NotFoundException('Dirección no encontrada');
        throw new ConflictException('La dirección cambió desde que la abriste. Volvé a cargarla antes de guardar.');
      }
      throw error;
    }
  }

  async setAddressStatus(customerId: string, addressId: string, active: boolean, actorId: string): Promise<CustomerDetail> {
    return this.prisma.$transaction(async (tx) => {
      await lockCustomerManager(tx, actorId, customerId);
      // Serialize status changes per customer before counting active addresses.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Cliente no encontrado');
      const address = await tx.address.findFirst({ where: { id: addressId, customerId }, select: { id: true, active: true } });
      if (!address) throw new NotFoundException('Dirección no encontrada');
      if (address.active !== active) {
        if (!active && await tx.address.count({ where: { customerId, active: true } }) <= 1) {
          throw new ConflictException('Debe quedar al menos una dirección activa.');
        }
        await tx.address.update({ where: { id: addressId, customerId }, data: { active } });
        await tx.customerDataAudit.create({ data: { customerId, addressId, actorUserId: actorId, action: 'ADDRESS_STATUS', fields: ['active'] } });
      }
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: detailFields });
      return detail(customer);
    });
  }
}
