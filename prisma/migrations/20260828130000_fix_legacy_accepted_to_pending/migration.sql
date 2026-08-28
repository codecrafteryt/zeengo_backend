-- Legacy rows were migrated active -> accepted without accepted_at; driver must accept again.
UPDATE "driver_assignments"
SET "status" = 'pending'
WHERE "status" IN ('accepted', 'active')
  AND "accepted_at" IS NULL
  AND "started_at" IS NULL
  AND "completed_at" IS NULL
  AND "rejected_at" IS NULL;
