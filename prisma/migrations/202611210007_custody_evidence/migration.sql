CREATE TABLE "CustodyEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mediaType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION prevent_custody_evidence_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CustodyEvidence is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CustodyEvidence_append_only" BEFORE UPDATE OR DELETE ON "CustodyEvidence" FOR EACH ROW EXECUTE FUNCTION prevent_custody_evidence_mutation();
