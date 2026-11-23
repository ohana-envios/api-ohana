ALTER TABLE "Shipment" ADD COLUMN "plannedWindowStart" TEXT, ADD COLUMN "plannedWindowEnd" TEXT;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_planning_window_valid" CHECK (
  ("plannedWindowStart" IS NULL AND "plannedWindowEnd" IS NULL) OR
  ("plannedWindowStart" IS NOT NULL AND "plannedWindowEnd" IS NOT NULL AND "plannedFor" IS NOT NULL AND
   "plannedWindowStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "plannedWindowEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "plannedWindowStart" < "plannedWindowEnd")
);
