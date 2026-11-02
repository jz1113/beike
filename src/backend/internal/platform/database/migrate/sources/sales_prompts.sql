CREATE TABLE IF NOT EXISTS "SalesPromptOverride" (
  "workspaceId" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("workspaceId", "promptId")
);
