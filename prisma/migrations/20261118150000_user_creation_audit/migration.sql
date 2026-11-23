CREATE TABLE "UserCreationAudit" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCreationAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserCreationAudit_targetUserId_key" ON "UserCreationAudit"("targetUserId");
CREATE INDEX "UserCreationAudit_actorUserId_occurredAt_idx" ON "UserCreationAudit"("actorUserId", "occurredAt");
ALTER TABLE "UserCreationAudit" ADD CONSTRAINT "UserCreationAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserCreationAudit" ADD CONSTRAINT "UserCreationAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION prevent_user_creation_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UserCreationAudit is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserCreationAudit_append_only" BEFORE UPDATE OR DELETE ON "UserCreationAudit"
  FOR EACH ROW EXECUTE FUNCTION prevent_user_creation_audit_mutation();