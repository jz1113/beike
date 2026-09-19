-- Add allowedToolsJson column for session-scoped tool permission whitelist
ALTER TABLE "AssistantThread" ADD COLUMN "allowedToolsJson" TEXT NOT NULL DEFAULT '[]';
