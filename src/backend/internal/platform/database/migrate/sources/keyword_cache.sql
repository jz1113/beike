
CREATE TABLE IF NOT EXISTS "KeywordLookupCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "rulesVersion" INTEGER NOT NULL,
  "query" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "KeywordLookupCache_workspaceId_rulesVersion_query_key" ON "KeywordLookupCache"("workspaceId", "rulesVersion", "query");
