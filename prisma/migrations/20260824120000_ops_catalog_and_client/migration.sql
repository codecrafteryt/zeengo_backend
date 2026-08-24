-- AlterEnum VendorType
ALTER TYPE "VendorType" ADD VALUE IF NOT EXISTS 'service';
ALTER TYPE "VendorType" ADD VALUE IF NOT EXISTS 'b2b';

-- CreateEnum BookingStaffRole
DO $$ BEGIN
  CREATE TYPE "BookingStaffRole" AS ENUM ('coordinator', 'sales', 'guide', 'support');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Itinerary ops fields
ALTER TABLE "itinerary_items"
  ADD COLUMN IF NOT EXISTS "car_plan" TEXT,
  ADD COLUMN IF NOT EXISTS "meeting_point" TEXT,
  ADD COLUMN IF NOT EXISTS "guide_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "pdf_url" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "extras" JSONB NOT NULL DEFAULT '{}';

-- Day-level logistics
CREATE TABLE IF NOT EXISTS "booking_day_plans" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "day_number" INTEGER NOT NULL,
  "plan_date" DATE,
  "car_plan" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_day_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_day_plans_booking_id_day_number_key"
  ON "booking_day_plans"("booking_id", "day_number");

CREATE INDEX IF NOT EXISTS "booking_day_plans_booking_id_idx"
  ON "booking_day_plans"("booking_id");

DO $$ BEGIN
  ALTER TABLE "booking_day_plans"
    ADD CONSTRAINT "booking_day_plans_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Team links on bookings
CREATE TABLE IF NOT EXISTS "booking_staff_links" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "staff_id" UUID NOT NULL,
  "role" "BookingStaffRole" NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_staff_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_staff_links_booking_id_staff_id_role_key"
  ON "booking_staff_links"("booking_id", "staff_id", "role");

CREATE INDEX IF NOT EXISTS "booking_staff_links_staff_id_idx"
  ON "booking_staff_links"("staff_id");

DO $$ BEGIN
  ALTER TABLE "booking_staff_links"
    ADD CONSTRAINT "booking_staff_links_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_staff_links"
    ADD CONSTRAINT "booking_staff_links_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_staff_links"
    ADD CONSTRAINT "booking_staff_links_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
