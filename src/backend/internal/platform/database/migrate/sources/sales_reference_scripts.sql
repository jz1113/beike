CREATE TABLE IF NOT EXISTS "SalesReferenceScript" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL DEFAULT '',
  "videoHash" TEXT NOT NULL DEFAULT '',
  "durationSec" REAL NOT NULL DEFAULT 0,
  "format" TEXT NOT NULL DEFAULT 'presenter',
  "voiceMode" TEXT NOT NULL DEFAULT 'speech',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scriptJson" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT '',
  "promptVersion" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "SalesReferenceScript_workspace_idx" ON "SalesReferenceScript"("workspaceId", "status", "updatedAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "SalesReferenceScript_hash_idx" ON "SalesReferenceScript"("workspaceId", "videoHash", "promptVersion");

CREATE TABLE IF NOT EXISTS "SalesProductionPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'all',
  "configJson" TEXT NOT NULL,
  "isDefault" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "SalesProductionPreset_workspace_idx" ON "SalesProductionPreset"("workspaceId", "category", "updatedAt" DESC);
