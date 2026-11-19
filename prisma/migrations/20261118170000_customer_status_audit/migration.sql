CREATE TABLE "CustomerStatusAudit" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "previousEnabled" BOOLEAN NOT NULL,
  "nextEnabled" BOOLEAN NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerStatusAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerStatusAudit_customerId_occurredAt_idx" ON "CustomerStatusAudit"("customerId", "occurredAt");
ALTER TABLE "CustomerStatusAudit" ADD CONSTRAINT "CustomerStatusAudit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerStatusAudit" ADD CONSTRAINT "CustomerStatusAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION prevent_customer_status_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CustomerStatusAudit is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerStatusAudit_append_only" BEFORE UPDATE OR DELETE ON "CustomerStatusAudit"
  FOR EACH ROW EXECUTE FUNCTION prevent_customer_status_audit_mutation();