CREATE TABLE "CustomerRegistration" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailKey" TEXT NOT NULL,
  "pending" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedById" TEXT,
  CONSTRAINT "CustomerRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerRegistration_customerId_key" ON "CustomerRegistration"("customerId");
CREATE UNIQUE INDEX "CustomerRegistration_userId_key" ON "CustomerRegistration"("userId");
CREATE UNIQUE INDEX "CustomerRegistration_emailKey_key" ON "CustomerRegistration"("emailKey");
CREATE INDEX "CustomerRegistration_pending_createdAt_idx" ON "CustomerRegistration"("pending", "createdAt");
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
