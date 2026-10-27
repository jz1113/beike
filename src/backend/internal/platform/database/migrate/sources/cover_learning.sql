ALTER TABLE "CoverMemorySample" ADD COLUMN "requestKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CoverMemorySample" ADD COLUMN "inputHash" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "CoverMemorySample_request_idx" ON "CoverMemorySample"("workspaceId", "requestKey") WHERE "requestKey" <> '';
ALTER TABLE "CoverMemoryUsage" ADD COLUMN "rating" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CoverMemoryUsage" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
CREATE TABLE "CoverMemoryRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "entryCount" INTEGER NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX "CoverMemoryRevision_workspace_idx" ON "CoverMemoryRevision"("workspaceId", "createdAt");
CREATE INDEX "CoverMemoryEntry_sample_idx" ON "CoverMemoryEntry"("workspaceId", "sampleId", "status");
