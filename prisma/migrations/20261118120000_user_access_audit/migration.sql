CREATE TABLE "UserAccessAudit" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "previousRole" "UserRole" NOT NULL,
  "previousEnabled" BOOLEAN NOT NULL,
  "nextRole" "UserRole" NOT NULL,
  "nextEnabled" BOOLEAN NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAccessAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserAccessAudit_targetUserId_occurredAt_idx" ON "UserAccessAudit"("targetUserId", "occurredAt");
CREATE INDEX "UserAccessAudit_actorUserId_occurredAt_idx" ON "UserAccessAudit"("actorUserId", "occurredAt");
ALTER TABLE "UserAccessAudit" ADD CONSTRAINT "UserAccessAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserAccessAudit" ADD CONSTRAINT "UserAccessAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION prevent_user_access_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UserAccessAudit is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserAccessAudit_append_only" BEFORE UPDATE OR DELETE ON "UserAccessAudit"
  FOR EACH ROW EXECUTE FUNCTION prevent_user_access_audit_mutation();
