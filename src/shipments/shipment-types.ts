import type { AddressFields } from '../customers/customers.address.js';

export type ShipmentInput = {
  customerId: string;
  recipientName: string;
  recipientPhone: string | null;
  pickup: { kind: 'saved'; id: string } | { kind: 'new'; address: AddressFields; save: boolean };
  delivery: AddressFields;
  packageDescription: string | null;
  requestedPickupAt: Date | null;
  requestedDeliveryAt: Date | null;
  notes: string | null;
};
