-- Guest/staff chat channel for Support / Driver / Splizer visibility.
-- Kept after feature revert so production _prisma_migrations history stays valid.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "target_role" TEXT;
CREATE INDEX IF NOT EXISTS "messages_conversation_id_target_role_idx"
  ON "messages" ("conversation_id", "target_role");
