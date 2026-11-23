import { BadRequestException } from '@nestjs/common';
import { parseAddress } from '../customers/customers.address.js';
import type { ShipmentInput } from './shipment-types.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Datos de envío inválidos');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false, field = 'dato') : string {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new BadRequestException(`Revisá ${field}: es obligatorio cuando corresponde y admite hasta ${max} caracteres.`);
  return value.trim();
}
export function parseShipmentInput(body: unknown): ShipmentInput {
  const input = object(body);
  const keys = ['customerId', 'recipientName', 'recipientPhone', 'pickup', 'delivery', 'packageDescription', 'requestedPickupAt', 'requestedDeliveryAt', 'notes'];
  if (Object.keys(input).some((key) => !keys.includes(key)) || keys.filter((key) => key !== 'requestedDeliveryAt').some((key) => !(key in input))) throw new BadRequestException('Datos de envío inválidos');
  const customerId = text(input.customerId, 128, true, 'el cliente');
  const recipientName = text(input.recipientName, 120, true, 'el nombre del destinatario');
  const recipientPhone = text(input.recipientPhone, 40, true, 'el teléfono del destinatario');
  if (!/^[+\d() .-]+$/.test(recipientPhone) || !/\d/.test(recipientPhone)) throw new BadRequestException('Teléfono del destinatario inválido.');
  const packageDescription = text(input.packageDescription, 500, true, 'la descripción del paquete');
  const notes = text(input.notes, 1000, false, 'las observaciones') || null;
  const date = (value: unknown): Date | null => {
    const requested = text(value, 30);
    if (requested && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(requested) || Number.isNaN(Date.parse(requested)))) throw new BadRequestException('Fecha de envío inválida.');
    return requested ? new Date(requested) : null;
  };
  const requestedPickupAt = date(input.requestedPickupAt), requestedDeliveryAt = date(input.requestedDeliveryAt ?? '');
  if (requestedPickupAt && requestedDeliveryAt && requestedDeliveryAt < requestedPickupAt) throw new BadRequestException('La entrega no puede ser anterior al retiro.');
  const source = object(input.pickup);
  let pickup: ShipmentInput['pickup'];
  if (source.kind === 'saved' && Object.keys(source).length === 2) pickup = { kind: 'saved', id: text(source.id, 128, true) };
  else if (source.kind === 'new' && Object.keys(source).length === 3 && typeof source.save === 'boolean') pickup = { kind: 'new', address: parseAddress(source.address, false), save: source.save };
  else throw new BadRequestException('Dirección de retiro inválida.');
  return { customerId, recipientName, recipientPhone, pickup, delivery: parseAddress(input.delivery, false), packageDescription, requestedPickupAt, requestedDeliveryAt, notes };
}
