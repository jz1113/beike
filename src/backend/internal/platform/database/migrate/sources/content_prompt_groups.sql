
ALTER TABLE "FullPromptAsset" ADD COLUMN "sourceImageIndices" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "groupIndex" INTEGER;
ALTER TABLE "FullPromptAsset" ADD COLUMN "contentSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "architectureSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "replaceableSlots" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "shotPromptsJson" TEXT;
CREATE INDEX IF NOT EXISTS "FullPromptAsset_album_group_idx" ON "FullPromptAsset"("albumId", "groupIndex");
