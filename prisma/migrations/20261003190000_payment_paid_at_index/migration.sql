-- Speed finance/dashboard "paid today" aggregates that filter on paid_at.

CREATE INDEX IF NOT EXISTS "payments_paid_at_idx" ON "payments"("paid_at");
