
CREATE TABLE IF NOT EXISTS "KeywordReviewRuleRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "entriesJson" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "KeywordReviewRuleRevision_workspaceId_version_key" ON "KeywordReviewRuleRevision"("workspaceId", "version");
CREATE INDEX IF NOT EXISTS "KeywordReviewRuleRevision_workspaceId_createdAt_idx" ON "KeywordReviewRuleRevision"("workspaceId", "createdAt");
