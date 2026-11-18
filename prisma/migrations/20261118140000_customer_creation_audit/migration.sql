CREATE TABLE "CustomerCreationAudit" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('ADMIN', 'SELF')),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCreationAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerCreationAudit_customerId_key" ON "CustomerCreationAudit"("customerId");
CREATE INDEX "CustomerCreationAudit_actorUserId_occurredAt_idx" ON "CustomerCreationAudit"("actorUserId", "occurredAt");
ALTER TABLE "CustomerCreationAudit" ADD CONSTRAINT "CustomerCreationAudit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCreationAudit" ADD CONSTRAINT "CustomerCreationAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION prevent_customer_creation_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CustomerCreationAudit is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerCreationAudit_append_only" BEFORE UPDATE OR DELETE ON "CustomerCreationAudit"
  FOR EACH ROW EXECUTE FUNCTION prevent_customer_creation_audit_mutation();
