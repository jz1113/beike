CREATE TABLE IF NOT EXISTS "PromptImportSource" (
  "sourceKey" TEXT PRIMARY KEY NOT NULL,
  "requestId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "albumName" TEXT NOT NULL DEFAULT '',
  "albumId" TEXT,
  "updatedAt" TEXT NOT NULL
);