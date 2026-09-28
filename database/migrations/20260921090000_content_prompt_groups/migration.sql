-- 将原本按单图存储的完整提示词，升级为可保存「内容图组」母本；旧数据保持兼容。
ALTER TABLE "FullPromptAsset" ADD COLUMN "sourceImageIndices" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "groupIndex" INTEGER;
ALTER TABLE "FullPromptAsset" ADD COLUMN "contentSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "architectureSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "replaceableSlots" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "shotPromptsJson" TEXT;

CREATE INDEX "FullPromptAsset_album_group_idx"
ON "FullPromptAsset"("albumId", "groupIndex");
