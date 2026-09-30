-- Public website catalog: rich vendor fields, hotel rooms, vehicle classes, train routes (additive).

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "address" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "data_source" TEXT,
ADD COLUMN     "duration_label" TEXT,
ADD COLUMN     "images" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "languages" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "name_ar" TEXT,
ADD COLUMN     "name_en" TEXT,
ADD COLUMN     "name_ru" TEXT,
ADD COLUMN     "price_currency" TEXT NOT NULL DEFAULT 'RUB',
ADD COLUMN     "price_from" DECIMAL(12,2),
ADD COLUMN     "price_unit" TEXT,
ADD COLUMN     "rating" DECIMAL(3,2),
ADD COLUMN     "rating_count" INTEGER,
ADD COLUMN     "stars" INTEGER,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summary_ar" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "yandex_maps_url" TEXT;

-- CreateTable
CREATE TABLE "hotel_rooms" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ru" TEXT,
    "size_m2" INTEGER,
    "beds" TEXT,
    "max_guests" INTEGER,
    "breakfast" BOOLEAN,
    "images" JSONB NOT NULL DEFAULT '[]',
    "rate" DECIMAL(12,2),
    "rate_currency" TEXT NOT NULL DEFAULT 'RUB',
    "refundable" BOOLEAN,
    "source_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hotel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_classes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "group" TEXT,
    "models" TEXT,
    "max_pax" INTEGER NOT NULL,
    "max_bags" INTEGER,
    "rate_airport" DECIMAL(12,2),
    "rate_hourly" DECIMAL(12,2),
    "rate_day8" DECIMAL(12,2),
    "rate_currency" TEXT NOT NULL DEFAULT 'RUB',
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vehicle_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "train_routes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "from_station" TEXT NOT NULL,
    "to_station" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "type" TEXT,
    "type_label" TEXT,
    "duration" TEXT,
    "departures" TEXT,
    "classes" JSONB NOT NULL DEFAULT '[]',
    "km" INTEGER,
    "rate_from" DECIMAL(12,2),
    "rate_currency" TEXT NOT NULL DEFAULT 'RUB',
    "operator" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "train_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_rooms_vendor_id_sort_order_idx" ON "hotel_rooms"("vendor_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_classes_key_key" ON "vehicle_classes"("key");

-- CreateIndex
CREATE UNIQUE INDEX "train_routes_key_key" ON "train_routes"("key");

-- CreateIndex
CREATE INDEX "vendors_type_is_published_idx" ON "vendors"("type", "is_published");

-- AddForeignKey
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

