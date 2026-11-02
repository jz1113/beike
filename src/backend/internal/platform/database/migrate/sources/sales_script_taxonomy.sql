CREATE TABLE IF NOT EXISTS "SalesScriptTaxonomy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('category', 'style')),
  "name" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesScriptTaxonomy_name_idx" ON "SalesScriptTaxonomy" ("workspaceId", "kind", "name" COLLATE NOCASE);
