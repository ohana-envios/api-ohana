CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "issuedById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "claimedSubject" TEXT,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_targetUserId_createdAt_idx" ON "UserInvitation"("targetUserId", "createdAt");
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION guard_user_invitation_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'UserInvitation history cannot be deleted'; END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."targetUserId" IS DISTINCT FROM OLD."targetUserId"
    OR NEW."issuedById" IS DISTINCT FROM OLD."issuedById" OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR OLD."usedAt" IS NOT NULL OR OLD."revokedAt" IS NOT NULL
    OR ((NEW."usedAt" IS NULL) = (NEW."revokedAt" IS NULL))
    OR ((NEW."usedAt" IS NULL) <> (NEW."claimedSubject" IS NULL)) THEN
    RAISE EXCEPTION 'Invalid UserInvitation history transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserInvitation_guard_history" BEFORE UPDATE OR DELETE ON "UserInvitation"
  FOR EACH ROW EXECUTE FUNCTION guard_user_invitation_history();
