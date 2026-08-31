-- Step 1: extend AssignmentStatus enum (must commit before using new values)

ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'in_progress';
