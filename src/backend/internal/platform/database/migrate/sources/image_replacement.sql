
CREATE TABLE IF NOT EXISTS "FullPromptImageReplacement" (
  "motherAssetId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "reviewId" TEXT NOT NULL UNIQUE,
  "sourceSnapshotJson" TEXT NOT NULL,
  "generatedImagesJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FullPromptImageReplacement_workspaceId_idx"
  ON "FullPromptImageReplacement"("workspaceId");
