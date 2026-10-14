
ALTER TABLE "FullPromptAsset" ADD COLUMN "productSubcategory" TEXT;
CREATE INDEX IF NOT EXISTS "FullPromptAsset_productSubcategory_idx"
  ON "FullPromptAsset"("productSubcategory");
