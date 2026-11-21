CREATE TABLE "Courier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "vehicle" TEXT,
  "capacity" TEXT,
  "workingHours" TEXT,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Courier_displayName_id_idx" ON "Courier"("displayName", "id");
CREATE TABLE "CourierAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courierId" TEXT NOT NULL REFERENCES "Courier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "fields" TEXT[] NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CourierAudit_courierId_occurredAt_idx" ON "CourierAudit"("courierId", "occurredAt");
CREATE FUNCTION prevent_courier_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CourierAudit is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CourierAudit_append_only" BEFORE UPDATE OR DELETE ON "CourierAudit" FOR EACH ROW EXECUTE FUNCTION prevent_courier_audit_mutation();
