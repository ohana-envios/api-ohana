CREATE TABLE "DeliveryEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storageKey" TEXT NOT NULL UNIQUE,
  "mediaType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION prevent_delivery_evidence_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'DeliveryEvidence is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "DeliveryEvidence_append_only" BEFORE UPDATE OR DELETE ON "DeliveryEvidence" FOR EACH ROW EXECUTE FUNCTION prevent_delivery_evidence_mutation();
