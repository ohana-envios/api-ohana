CREATE TABLE "PushDevice" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "token" TEXT NOT NULL UNIQUE, "enabled" BOOLEAN NOT NULL DEFAULT TRUE, "validUntil" TIMESTAMPTZ(3) NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "PushDevice_userId_enabled_idx" ON "PushDevice"("userId", "enabled");
CREATE TABLE "PushDelivery" (
 "id" TEXT PRIMARY KEY, "proposalId" TEXT NOT NULL REFERENCES "RescheduleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "deviceId" TEXT NOT NULL REFERENCES "PushDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RECEIPT','DELIVERED','FAILED','CANCELED')),
 "attempts" INT NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "ticketId" TEXT, "lastError" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("proposalId", "deviceId")
);
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");
