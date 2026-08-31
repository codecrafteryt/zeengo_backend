-- Step 2: lifecycle timestamps + migrate legacy active rows

ALTER TABLE "driver_assignments" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMPTZ(6);
ALTER TABLE "driver_assignments" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ(6);
ALTER TABLE "driver_assignments" ADD COLUMN IF NOT EXISTS "rejected_reason" TEXT;
ALTER TABLE "driver_assignments" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ(6);
ALTER TABLE "driver_assignments" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ(6);

UPDATE "driver_assignments" SET "status" = 'accepted' WHERE "status" = 'active';

ALTER TABLE "driver_assignments" ALTER COLUMN "status" SET DEFAULT 'pending';
