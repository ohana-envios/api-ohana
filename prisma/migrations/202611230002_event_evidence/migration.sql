CREATE TABLE "EventEvidence" (
  "id" TEXT PRIMARY KEY,
  "requestKey" TEXT NOT NULL UNIQUE,
  "targetEventId" TEXT NOT NULL REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "auditEventId" TEXT NOT NULL UNIQUE REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorUserId" TEXT NOT NULL, "actorLabel" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL UNIQUE, "mediaType" TEXT NOT NULL, "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EventEvidence_targetEventId_createdAt_idx" ON "EventEvidence"("targetEventId", "createdAt");
CREATE FUNCTION prevent_event_evidence_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'EventEvidence is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "EventEvidence_append_only" BEFORE UPDATE OR DELETE ON "EventEvidence" FOR EACH ROW EXECUTE FUNCTION prevent_event_evidence_mutation();
