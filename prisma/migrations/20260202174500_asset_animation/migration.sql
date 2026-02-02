-- Add fields to persist Veo/animated video per Asset

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "animationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "animationVideoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "animationJobId" TEXT,
  ADD COLUMN IF NOT EXISTS "animationProvider" TEXT;
