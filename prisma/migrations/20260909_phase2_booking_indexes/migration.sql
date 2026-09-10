-- Phase 2: booking-scoped query indexes (idempotent-safe via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "tasks_booking_id_idx" ON "tasks"("booking_id");
CREATE INDEX IF NOT EXISTS "sos_alerts_booking_id_idx" ON "sos_alerts"("booking_id");
