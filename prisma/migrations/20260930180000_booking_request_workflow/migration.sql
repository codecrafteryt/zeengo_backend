-- AlterEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('pending', 'under_review', 'confirmed', 'rejected');
CREATE TYPE "BookingSource" AS ENUM ('staff', 'customer_web', 'customer_app');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'booking_request';

-- AlterTable
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "children_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "request_status" "BookingRequestStatus" NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS "source" "BookingSource" NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS "customer_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- Make created_by nullable for customer-originated bookings
ALTER TABLE "bookings" ALTER COLUMN "created_by" DROP NOT NULL;

-- Drop restrictive FK and recreate with ON DELETE SET NULL
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_created_by_fkey";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "staff_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_idempotency_key_key" ON "bookings"("idempotency_key");
CREATE INDEX IF NOT EXISTS "bookings_request_status_idx" ON "bookings"("request_status");
CREATE INDEX IF NOT EXISTS "bookings_source_idx" ON "bookings"("source");
