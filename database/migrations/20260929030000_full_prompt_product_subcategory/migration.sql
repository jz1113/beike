ALTER TABLE "FullPromptAsset" ADD COLUMN "productSubcategory" TEXT;

CREATE INDEX "FullPromptAsset_productSubcategory_idx"
  ON "FullPromptAsset"("productSubcategory");
