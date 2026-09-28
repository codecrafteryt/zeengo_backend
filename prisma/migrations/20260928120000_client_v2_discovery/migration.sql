-- Client app v2 discovery tables (additive; v1 client portal unchanged)

CREATE TABLE IF NOT EXISTS "discovery_places" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "arabic_description" TEXT,
    "area" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Sight',
    "around_section" TEXT,
    "home_rail" TEXT,
    "image_url" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "open_label" TEXT,
    "price_label" TEXT,
    "badge" TEXT,
    "is_free" BOOLEAN NOT NULL DEFAULT true,
    "subtitle" TEXT,
    "food_description" TEXT,
    "food_location" TEXT,
    "halal_friendly" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_places_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discovery_places_slug_key" ON "discovery_places"("slug");
CREATE INDEX IF NOT EXISTS "discovery_places_around_section_sort_order_idx" ON "discovery_places"("around_section", "sort_order");
CREATE INDEX IF NOT EXISTS "discovery_places_home_rail_sort_order_idx" ON "discovery_places"("home_rail", "sort_order");
CREATE INDEX IF NOT EXISTS "discovery_places_category_idx" ON "discovery_places"("category");

CREATE TABLE IF NOT EXISTS "discovery_destinations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "image_url" TEXT,
    "use_placeholder" BOOLEAN NOT NULL DEFAULT false,
    "near_me" BOOLEAN NOT NULL DEFAULT false,
    "today" BOOLEAN NOT NULL DEFAULT false,
    "daylight" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_destinations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discovery_destinations_slug_key" ON "discovery_destinations"("slug");
CREATE INDEX IF NOT EXISTS "discovery_destinations_sort_order_idx" ON "discovery_destinations"("sort_order");

CREATE TABLE IF NOT EXISTS "discovery_chips" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subtitle" TEXT,
    "icon_key" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_chips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discovery_chips_kind_key_key" ON "discovery_chips"("kind", "key");
CREATE INDEX IF NOT EXISTS "discovery_chips_kind_sort_order_idx" ON "discovery_chips"("kind", "sort_order");

CREATE TABLE IF NOT EXISTS "discovery_trip_days" (
    "id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "mosque_km" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_trip_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discovery_trip_days_day_number_key" ON "discovery_trip_days"("day_number");

CREATE TABLE IF NOT EXISTS "discovery_trip_stops" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_trip_stops_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "discovery_trip_stops_day_id_sort_order_idx" ON "discovery_trip_stops"("day_id", "sort_order");

ALTER TABLE "discovery_trip_stops"
  DROP CONSTRAINT IF EXISTS "discovery_trip_stops_day_id_fkey";
ALTER TABLE "discovery_trip_stops"
  ADD CONSTRAINT "discovery_trip_stops_day_id_fkey"
  FOREIGN KEY ("day_id") REFERENCES "discovery_trip_days"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
