ALTER TABLE "Shipment" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "Shipment_requestKey_key" ON "Shipment"("requestKey");
