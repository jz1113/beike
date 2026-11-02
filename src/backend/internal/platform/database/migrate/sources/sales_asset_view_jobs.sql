CREATE TABLE IF NOT EXISTS "SalesAssetViewJob" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "assetId" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT NOT NULL DEFAULT '',
  "imagesJson" TEXT NOT NULL DEFAULT '{}',
  "taskId" TEXT NOT NULL DEFAULT '',
  "resultUrl" TEXT NOT NULL DEFAULT '',
  "generationJson" TEXT NOT NULL DEFAULT '{}',
  "assetDataJson" TEXT NOT NULL DEFAULT '{}',
  "baseSaved" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("workspaceId", "requestKey")
);
CREATE INDEX IF NOT EXISTS "SalesAssetViewJob_workspace_updated" ON "SalesAssetViewJob" ("workspaceId", "updatedAt" DESC);
