-- QualityPromptAsset + provenance fields
CREATE TABLE IF NOT EXISTS "QualityPromptAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "QualityPromptAsset_isDefault_idx" ON "QualityPromptAsset"("isDefault");
CREATE INDEX IF NOT EXISTS "QualityPromptAsset_createdAt_idx" ON "QualityPromptAsset"("createdAt");

ALTER TABLE "SceneAsset" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ActionAsset" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "OutfitAsset" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "PersonaAsset" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'manual';
