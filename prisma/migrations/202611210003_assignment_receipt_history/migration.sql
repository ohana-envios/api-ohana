ALTER TABLE "Shipment" ADD COLUMN "assignedCourierId" TEXT REFERENCES "Courier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentReceipt" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "Shipment_assignedCourierId_status_idx" ON "Shipment"("assignedCourierId", "status");
CREATE TABLE "ShipmentReceiptHistory" (
 "id" TEXT NOT NULL PRIMARY KEY, "shipmentId" TEXT NOT NULL REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "replacedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "oldUploaderId" TEXT NOT NULL, "oldMediaType" TEXT NOT NULL, "oldSize" INTEGER NOT NULL, "oldData" BYTEA NOT NULL,
 "oldCreatedAt" TIMESTAMPTZ(3) NOT NULL, "replacedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ShipmentReceiptHistory_shipmentId_replacedAt_idx" ON "ShipmentReceiptHistory"("shipmentId", "replacedAt");
CREATE FUNCTION prevent_shipment_receipt_history_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ShipmentReceiptHistory is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ShipmentReceiptHistory_append_only" BEFORE UPDATE OR DELETE ON "ShipmentReceiptHistory" FOR EACH ROW EXECUTE FUNCTION prevent_shipment_receipt_history_mutation();
