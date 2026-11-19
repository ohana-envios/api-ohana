CREATE TABLE "CustomerDataAudit" (
 "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "addressId" TEXT, "actorUserId" TEXT NOT NULL,
 "action" TEXT NOT NULL CHECK ("action" IN ('CUSTOMER_EDIT', 'ADDRESS_CREATE', 'ADDRESS_EDIT', 'ADDRESS_STATUS')),
 "fields" TEXT[] NOT NULL, "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CustomerDataAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerDataAudit_customerId_occurredAt_idx" ON "CustomerDataAudit"("customerId", "occurredAt");
ALTER TABLE "CustomerDataAudit" ADD CONSTRAINT "CustomerDataAudit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerDataAudit" ADD CONSTRAINT "CustomerDataAudit_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerDataAudit" ADD CONSTRAINT "CustomerDataAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION prevent_customer_data_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CustomerDataAudit is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerDataAudit_append_only" BEFORE UPDATE OR DELETE ON "CustomerDataAudit" FOR EACH ROW EXECUTE FUNCTION prevent_customer_data_audit_mutation();