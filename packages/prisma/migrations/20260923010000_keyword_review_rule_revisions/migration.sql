CREATE TABLE "KeywordReviewRuleRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "entriesJson" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "KeywordReviewRuleRevision_workspaceId_version_key" ON "KeywordReviewRuleRevision"("workspaceId", "version");
CREATE INDEX "KeywordReviewRuleRevision_workspaceId_createdAt_idx" ON "KeywordReviewRuleRevision"("workspaceId", "createdAt");
