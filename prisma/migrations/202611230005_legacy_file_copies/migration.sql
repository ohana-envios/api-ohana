CREATE TABLE "LegacyFileCopy" (
 "id" TEXT PRIMARY KEY, "sourceKind" TEXT NOT NULL CHECK ("sourceKind" IN ('CUSTODY', 'RECEIPT', 'RECEIPT_HISTORY')),
 "sourceId" TEXT NOT NULL, "sourceSha256" TEXT NOT NULL, "storageKey" TEXT NOT NULL UNIQUE,
 "mediaType" TEXT NOT NULL, "size" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("sourceKind", "sourceId", "sourceSha256")
);
CREATE FUNCTION prevent_legacy_file_copy_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'LegacyFileCopy is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "LegacyFileCopy_append_only" BEFORE UPDATE OR DELETE ON "LegacyFileCopy" FOR EACH ROW EXECUTE FUNCTION prevent_legacy_file_copy_mutation();
