ALTER TABLE "Shipment" ADD COLUMN "plannedFor" DATE;
CREATE INDEX "Shipment_plannedFor_idx" ON "Shipment"("plannedFor");
