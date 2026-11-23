CREATE TABLE "IncidentEvidence" (
  "id" TEXT PRIMARY KEY,
  "requestKey" TEXT NOT NULL UNIQUE,
  "incidentId" TEXT NOT NULL REFERENCES "ShipmentIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorUserId" TEXT NOT NULL,
  "actorLabel" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL UNIQUE,
  "mediaType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IncidentEvidence_incidentId_createdAt_idx" ON "IncidentEvidence"("incidentId", "createdAt");
CREATE FUNCTION prevent_incident_evidence_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'IncidentEvidence is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "IncidentEvidence_append_only" BEFORE UPDATE OR DELETE ON "IncidentEvidence" FOR EACH ROW EXECUTE FUNCTION prevent_incident_evidence_mutation();
