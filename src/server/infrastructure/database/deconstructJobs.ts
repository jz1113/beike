export const deconstructJobsSql = `
CREATE TABLE IF NOT EXISTS "DeconstructJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "jobId" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
  "configJson" TEXT NOT NULL, "concurrency" INTEGER NOT NULL, "reviewBeforeSave" BOOLEAN NOT NULL,
  "stopRequested" BOOLEAN NOT NULL DEFAULT false, "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  "finishedAt" DATETIME
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeconstructJob_workspaceId_jobId_key" ON "DeconstructJob"("workspaceId", "jobId");
CREATE INDEX IF NOT EXISTS "DeconstructJob_workspaceId_createdAt_idx" ON "DeconstructJob"("workspaceId", "createdAt");
CREATE TABLE IF NOT EXISTS "DeconstructJobItem" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "jobId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "position" INTEGER NOT NULL, "inputJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued', "progressJson" TEXT, "resultJson" TEXT, "error" TEXT,
  "startedAt" DATETIME, "dispatchedAt" DATETIME, "finishedAt" DATETIME, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeconstructJobItem_workspaceId_jobId_itemId_key" ON "DeconstructJobItem"("workspaceId", "jobId", "itemId");
CREATE INDEX IF NOT EXISTS "DeconstructJobItem_workspaceId_jobId_position_idx" ON "DeconstructJobItem"("workspaceId", "jobId", "position");
`;
