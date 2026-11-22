import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ShipmentInput } from './shipment-types.js';
import type { ReceiptFile } from './receipt-input.js';

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actorId: string, input: ShipmentInput, receipt?: ReceiptFile, key?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'CUSTOMER'].includes(actor.role)) throw new ForbiddenException('Operation not permitted');
      if (actor.role === 'CUSTOMER') {
        const registration = await tx.customerRegistration.findUnique({ where: { userId: actorId }, select: { customerId: true, pending: true, approvedAt: true, approvedById: true } });
        if (!registration || registration.customerId !== input.customerId || registration.pending || !registration.approvedAt || !registration.approvedById) throw new ForbiddenException('Operation not permitted');
      }
      if (key) {
        const existing = await tx.shipment.findFirst({ where: { OR: [{ requestKey: key.toUpperCase() }, { code: `OH-${key.toUpperCase()}` }] }, select: { id: true, code: true, status: true, createdAt: true, createdByUserId: true, customerId: true } });
        if (existing) {
          if (existing.createdByUserId !== actorId || existing.customerId !== input.customerId) throw new ConflictException('Identificador de operación ya utilizado.');
          const { createdByUserId: _creator, customerId: _customer, ...result } = existing;
          return result;
        }
      }
      let code = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = `OH-${randomBytes(6).toString('hex').toUpperCase()}`;
        if (!await tx.shipment.findUnique({ where: { code: candidate }, select: { id: true } })) { code = candidate; break; }
      }
      if (!code) throw new ConflictException('No se pudo generar el código. Intentá nuevamente.');
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${input.customerId} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { displayName: true, phone: true, enabled: true } });
      if (!customer?.enabled) throw new NotFoundException('Cliente no disponible');
      const pickup = input.pickup.kind === 'saved'
        ? await tx.address.findFirst({ where: { id: input.pickup.id, customerId: input.customerId, active: true }, select: { street: true, number: true, locality: true, department: true, reference: true } })
        : input.pickup.address;
      if (!pickup) throw new NotFoundException('Dirección de retiro no disponible');
      if (input.pickup.kind === 'new' && input.pickup.save) {
        const address = await tx.address.create({ data: { ...input.pickup.address, customerId: input.customerId }, select: { id: true } });
        await tx.customerDataAudit.create({ data: { customerId: input.customerId, addressId: address.id, actorUserId: actorId, action: 'ADDRESS_CREATE', fields: Object.keys(input.pickup.address) } });
      }
      const shipment = await tx.shipment.create({ data: {
        code, requestKey: key?.toUpperCase(), customerId: input.customerId, createdByUserId: actorId,
        senderName: customer.displayName, senderPhone: customer.phone, recipientName: input.recipientName, recipientPhone: input.recipientPhone,
        pickupStreet: pickup.street, pickupNumber: pickup.number, pickupLocality: pickup.locality, pickupDepartment: pickup.department, pickupReference: pickup.reference,
        deliveryStreet: input.delivery.street, deliveryNumber: input.delivery.number, deliveryLocality: input.delivery.locality, deliveryDepartment: input.delivery.department, deliveryReference: input.delivery.reference,
        requestedPickupAt: input.requestedPickupAt, requestedDeliveryAt: input.requestedDeliveryAt, custody: 'SENDER', notes: input.notes,
        ...(input.packageDescription ? { packages: { create: { sequence: 1, description: input.packageDescription } } } : {}),
        ...(receipt ? { receipt: { create: { uploadedById: actorId, mediaType: receipt.mimetype, size: receipt.size, data: Uint8Array.from(receipt.buffer) } } } : {}),
        events: { create: [{ actorUserId: actorId, actorLabel: actor.displayName, type: 'CREATED', newStatus: 'PENDING', notes: 'Custodia inicial: cliente/remitente' }, ...(receipt ? [{ actorUserId: actorId, actorLabel: actor.displayName, type: 'RECEIPT_ADDED' }] : [])] },
      }, select: { id: true, code: true, status: true, createdAt: true } });
      return shipment;
    });
  }

  async attachReceipt(actorId: string, id: string, receipt: ReceiptFile, expectedVersion?: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261118, 20)`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, enabled: true, displayName: true } });
      if (!actor?.enabled || !['ADMIN', 'CUSTOMER'].includes(actor.role)) throw new ForbiddenException('Operation not permitted');
      await tx.$queryRaw`SELECT "id" FROM "Shipment" WHERE "id" = ${id} FOR UPDATE`;
      const shipment = await tx.shipment.findUnique({ where: { id }, select: { customerId: true, receipt: true } });
      if (!shipment) throw new NotFoundException('Envío no encontrado');
      if (actor.role === 'CUSTOMER') {
        const registration = await tx.customerRegistration.findUnique({ where: { userId: actorId }, select: { customerId: true, pending: true, approvedAt: true, approvedById: true, customer: { select: { enabled: true } } } });
        if (!registration || registration.customerId !== shipment.customerId || registration.pending || !registration.approvedAt || !registration.approvedById || !registration.customer.enabled) throw new NotFoundException('Envío no encontrado');
      }
      if (expectedVersion === undefined && shipment.receipt) throw new ConflictException('El envío ya tiene un comprobante.');
      if (expectedVersion !== undefined && (!shipment.receipt || shipment.receipt.version !== expectedVersion)) throw new ConflictException('El comprobante cambió. Recargá el envío.');
      let saved;
      if (shipment.receipt) {
        const old = shipment.receipt;
        await tx.shipmentReceiptHistory.create({ data: { shipmentId: id, replacedById: actorId, oldUploaderId: old.uploadedById, oldMediaType: old.mediaType, oldSize: old.size, oldData: old.data, oldCreatedAt: old.createdAt } });
        saved = await tx.shipmentReceipt.update({ where: { id: old.id }, data: { uploadedById: actorId, mediaType: receipt.mimetype, size: receipt.size, data: Uint8Array.from(receipt.buffer), createdAt: new Date(), version: { increment: 1 } }, select: { id: true, version: true } });
      } else saved = await tx.shipmentReceipt.create({ data: { shipmentId: id, uploadedById: actorId, mediaType: receipt.mimetype, size: receipt.size, data: Uint8Array.from(receipt.buffer) }, select: { id: true, version: true } });
      await tx.shipmentEvent.create({ data: { shipmentId: id, actorUserId: actorId, actorLabel: actor.displayName, type: shipment.receipt ? 'RECEIPT_REPLACED' : 'RECEIPT_ADDED' } });
      return { receipt: saved };
    });
  }
}
