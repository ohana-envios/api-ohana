CREATE INDEX "Customer_email_normalized_lookup_idx" ON "Customer" (lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g'))) WHERE "email" IS NOT NULL;
