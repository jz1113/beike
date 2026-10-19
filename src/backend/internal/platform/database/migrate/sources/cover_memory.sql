CREATE TABLE IF NOT EXISTS "CoverMemorySample" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "imageUrls" TEXT NOT NULL DEFAULT '[]',
  "model" TEXT NOT NULL DEFAULT '',
  "deconstruction" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'running',
  "error" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "CoverMemorySample_workspace_idx" ON "CoverMemorySample"("workspaceId", "createdAt");

CREATE TABLE IF NOT EXISTS "CoverMemoryEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "rule" TEXT NOT NULL,
  "evidence" TEXT NOT NULL DEFAULT '',
  "sampleId" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "source" TEXT NOT NULL DEFAULT 'sample',
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "CoverMemoryEntry_workspace_idx" ON "CoverMemoryEntry"("workspaceId", "branch", "status");

CREATE TABLE IF NOT EXISTS "CoverMemoryUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL DEFAULT '',
  "itemId" TEXT NOT NULL DEFAULT '',
  "itemTitle" TEXT NOT NULL DEFAULT '',
  "entryIds" TEXT NOT NULL DEFAULT '[]',
  "design" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "CoverMemoryUsage_workspace_idx" ON "CoverMemoryUsage"("workspaceId", "createdAt");
