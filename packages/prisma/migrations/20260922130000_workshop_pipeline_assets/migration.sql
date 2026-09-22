-- Workshop pipeline: idempotent image tasks, asset registry, reviews, and category links.
ALTER TABLE "ImageTask" ADD COLUMN "idempotencyKey" TEXT;
CREATE INDEX "ImageTask_idempotencyKey_idx" ON "ImageTask"("idempotencyKey");

ALTER TABLE "AssetProductCategory" ADD COLUMN "aliases" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "AssetProductCategory" ADD COLUMN "keywords" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "AssetProductCategory" ADD COLUMN "anatomy" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "PromptAssetRegistry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetType" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "provenance" TEXT NOT NULL DEFAULT 'manual',
  "sourceRef" TEXT,
  "qualityScore" REAL,
  "confidence" REAL,
  "publishedAt" DATETIME,
  "disabledReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PromptAssetRegistry_assetType_sourceAssetId_key" UNIQUE ("assetType", "sourceAssetId")
);
CREATE INDEX "PromptAssetRegistry_assetType_status_idx" ON "PromptAssetRegistry"("assetType", "status");
CREATE INDEX "PromptAssetRegistry_qualityScore_idx" ON "PromptAssetRegistry"("qualityScore");

CREATE TABLE "PromptAssetCategoryLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'suitable'
);
CREATE UNIQUE INDEX "PromptAssetCategoryLink_assetId_categoryId_scope_key" ON "PromptAssetCategoryLink"("assetId", "categoryId", "scope");
CREATE INDEX "PromptAssetCategoryLink_categoryId_idx" ON "PromptAssetCategoryLink"("categoryId");

CREATE TABLE "PromptAssetUsageEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "productId" TEXT,
  "taskId" TEXT,
  "eventType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX "PromptAssetUsageEvent_assetId_eventType_createdAt_idx" ON "PromptAssetUsageEvent"("assetId", "eventType", "createdAt");
CREATE INDEX "PromptAssetUsageEvent_batchId_idx" ON "PromptAssetUsageEvent"("batchId");

CREATE TABLE "WorkshopOutputReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "productFidelityScore" INTEGER,
  "compositionScore" INTEGER,
  "aestheticScore" INTEGER,
  "consistencyScore" INTEGER,
  "reasonCodesJson" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkshopOutputReview_batchId_productId_idx" ON "WorkshopOutputReview"("batchId", "productId");
CREATE INDEX "WorkshopOutputReview_taskId_idx" ON "WorkshopOutputReview"("taskId");

CREATE TABLE "WorkshopPipelineRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputRevision" INTEGER NOT NULL DEFAULT 0,
  "totalTasks" INTEGER NOT NULL DEFAULT 0,
  "completedTasks" INTEGER NOT NULL DEFAULT 0,
  "successTasks" INTEGER NOT NULL DEFAULT 0,
  "failedTasks" INTEGER NOT NULL DEFAULT 0,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "errorSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "WorkshopPipelineRun_batchId_status_idx" ON "WorkshopPipelineRun"("batchId", "status");
