-- CreateEnum
CREATE TYPE "VendorPaymentTerms" AS ENUM ('bank_transfer', 'cash', 'voucher');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN "payment_terms" "VendorPaymentTerms",
ADD COLUMN "cancellation_policy" TEXT;

-- AlterTable
ALTER TABLE "vendor_bookings" ADD COLUMN "service_date" DATE,
ADD COLUMN "pax" INTEGER,
ADD COLUMN "details" TEXT,
ADD COLUMN "voucher_code" TEXT,
ADD COLUMN "voucher_sent_at" TIMESTAMPTZ(6);
