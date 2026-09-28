-- Add reverse-engineering metadata fields to asset tables
ALTER TABLE "SceneAsset" ADD COLUMN "reversePrompt" TEXT;
ALTER TABLE "SceneAsset" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "SceneAsset" ADD COLUMN "sourceImageIndex" INTEGER;
ALTER TABLE "SceneAsset" ADD COLUMN "imageType" TEXT;

ALTER TABLE "OutfitAsset" ADD COLUMN "reversePrompt" TEXT;
ALTER TABLE "OutfitAsset" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "OutfitAsset" ADD COLUMN "sourceImageIndex" INTEGER;
ALTER TABLE "OutfitAsset" ADD COLUMN "imageType" TEXT;

ALTER TABLE "ActionAsset" ADD COLUMN "reversePrompt" TEXT;
ALTER TABLE "ActionAsset" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "ActionAsset" ADD COLUMN "sourceImageIndex" INTEGER;
ALTER TABLE "ActionAsset" ADD COLUMN "imageType" TEXT;

ALTER TABLE "PersonaAsset" ADD COLUMN "reversePrompt" TEXT;
ALTER TABLE "PersonaAsset" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "PersonaAsset" ADD COLUMN "sourceImageIndex" INTEGER;
ALTER TABLE "PersonaAsset" ADD COLUMN "imageType" TEXT;
