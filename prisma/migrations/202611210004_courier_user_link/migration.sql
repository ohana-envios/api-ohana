ALTER TABLE "Courier" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Courier_userId_key" ON "Courier"("userId");
ALTER TABLE "Courier" ADD CONSTRAINT "Courier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
