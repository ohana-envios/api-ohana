-- SCRUM-13: initial relational model. Address values on Shipment are snapshots.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER', 'COURIER');
CREATE TYPE "CustomerType" AS ENUM ('PERSON', 'COMPANY');
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_ROUTE', 'DELIVERED', 'CANCELED');
CREATE TYPE "ShipmentPriority" AS ENUM ('NORMAL', 'HIGH');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "externalAuthId" TEXT,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "type" "CustomerType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "legalName" TEXT,
  "documentNumber" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Address" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT,
  "street" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "locality" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "senderName" TEXT NOT NULL,
  "senderPhone" TEXT,
  "recipientName" TEXT NOT NULL,
  "recipientPhone" TEXT,
  "pickupStreet" TEXT NOT NULL,
  "pickupNumber" TEXT NOT NULL,
  "pickupLocality" TEXT NOT NULL,
  "pickupDepartment" TEXT NOT NULL,
  "pickupReference" TEXT,
  "deliveryStreet" TEXT NOT NULL,
  "deliveryNumber" TEXT NOT NULL,
  "deliveryLocality" TEXT NOT NULL,
  "deliveryDepartment" TEXT NOT NULL,
  "deliveryReference" TEXT,
  "requestedPickupAt" TIMESTAMPTZ(3),
  "pickedUpAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "priority" "ShipmentPriority" NOT NULL DEFAULT 'NORMAL',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Package" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "description" TEXT,
  "weightKg" DECIMAL(10,3),
  "lengthCm" DECIMAL(10,2),
  "widthCm" DECIMAL(10,2),
  "heightCm" DECIMAL(10,2),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorLabel" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "previousStatus" "ShipmentStatus",
  "newStatus" "ShipmentStatus",
  "notes" TEXT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_externalAuthId_key" ON "User"("externalAuthId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_enabled_idx" ON "User"("role", "enabled");
CREATE INDEX "Customer_type_documentNumber_idx" ON "Customer"("type", "documentNumber");
CREATE INDEX "Customer_enabled_displayName_idx" ON "Customer"("enabled", "displayName");
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");
CREATE INDEX "Shipment_customerId_createdAt_idx" ON "Shipment"("customerId", "createdAt");
CREATE INDEX "Shipment_status_priority_createdAt_idx" ON "Shipment"("status", "priority", "createdAt");
CREATE INDEX "Shipment_createdByUserId_idx" ON "Shipment"("createdByUserId");
CREATE UNIQUE INDEX "Package_shipmentId_sequence_key" ON "Package"("shipmentId", "sequence");
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");
CREATE INDEX "ShipmentEvent_actorUserId_idx" ON "ShipmentEvent"("actorUserId");

ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Package" ADD CONSTRAINT "Package_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The event log is append-only. No application role can rewrite historical events.
CREATE FUNCTION prevent_shipment_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ShipmentEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ShipmentEvent_append_only"
  BEFORE UPDATE OR DELETE ON "ShipmentEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_shipment_event_mutation();
