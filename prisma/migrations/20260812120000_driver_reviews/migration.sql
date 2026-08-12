-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN "reviews_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "driver_reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "driver_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_reviews_booking_id_driver_id_key" ON "driver_reviews"("booking_id", "driver_id");

-- CreateIndex
CREATE INDEX "driver_reviews_driver_id_created_at_idx" ON "driver_reviews"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "driver_reviews_client_id_idx" ON "driver_reviews"("client_id");

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
