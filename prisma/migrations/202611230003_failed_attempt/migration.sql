ALTER TABLE "ShipmentIncident" ADD COLUMN "failedAttempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShipmentIncident" ADD CONSTRAINT "ShipmentIncident_failed_phase" CHECK (NOT "failedAttempt" OR "phase" IN ('PICKUP', 'DELIVERY'));
