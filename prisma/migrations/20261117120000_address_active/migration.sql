-- Existing addresses remain active; shipment snapshots are not changed.
ALTER TABLE "Address" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
