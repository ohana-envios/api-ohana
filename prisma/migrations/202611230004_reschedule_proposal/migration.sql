CREATE TABLE "RescheduleProposal" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "shipmentId" TEXT NOT NULL REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorUserId" TEXT NOT NULL, "actorLabel" TEXT NOT NULL, "proposedDate" DATE NOT NULL,
 "windowStart" TEXT, "windowEnd" TEXT, "reason" TEXT NOT NULL, "nextAction" TEXT NOT NULL,
 "incidentId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RescheduleProposal_window_valid" CHECK (("windowStart" IS NULL AND "windowEnd" IS NULL) OR ("windowStart" IS NOT NULL AND "windowEnd" IS NOT NULL AND "windowStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowStart" < "windowEnd"))
);
CREATE INDEX "RescheduleProposal_shipmentId_createdAt_idx" ON "RescheduleProposal"("shipmentId", "createdAt");
CREATE TABLE "RescheduleDecision" (
 "id" TEXT PRIMARY KEY, "proposalId" TEXT NOT NULL UNIQUE REFERENCES "RescheduleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorUserId" TEXT NOT NULL, "actorLabel" TEXT NOT NULL, "approved" BOOLEAN NOT NULL, "notes" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION prevent_reschedule_proposal_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Reschedule records are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "RescheduleProposal_append_only" BEFORE UPDATE OR DELETE ON "RescheduleProposal" FOR EACH ROW EXECUTE FUNCTION prevent_reschedule_proposal_mutation();
CREATE TRIGGER "RescheduleDecision_append_only" BEFORE UPDATE OR DELETE ON "RescheduleDecision" FOR EACH ROW EXECUTE FUNCTION prevent_reschedule_proposal_mutation();
