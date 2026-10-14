CREATE TABLE IF NOT EXISTS "WorkshopBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "snapshotJson" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  "legacyRecovered" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "WorkshopBatch_updatedAt_idx" ON "WorkshopBatch" ("updatedAt" DESC);
CREATE TABLE IF NOT EXISTS "WorkshopBatchState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "activeBatchId" TEXT,
  "legacyMigratedAt" TEXT
)