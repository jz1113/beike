CREATE TABLE "FullPromptImageReplacement" (
  "motherAssetId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "reviewId" TEXT NOT NULL UNIQUE,
  "sourceSnapshotJson" TEXT NOT NULL,
  "generatedImagesJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FullPromptImageReplacement_workspaceId_idx"
  ON "FullPromptImageReplacement"("workspaceId");
