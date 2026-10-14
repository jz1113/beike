
-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "itemId" TEXT,
    "title" TEXT,
    "picUrl" TEXT,
    "detailUrls" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImageTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "prompt" TEXT NOT NULL,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultUrl" TEXT,
    "failReason" TEXT,
    "model" TEXT,
    "mediaType" TEXT DEFAULT 'image',
    "size" TEXT,
    "quality" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "productTitle" TEXT,
    "productFingerprint" TEXT,
    "modelUsed" TEXT,
    "styleName" TEXT,
    "promptsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StyleRecipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "tag" TEXT,
    "desc" TEXT,
    "promptSnippet" TEXT NOT NULL,
    "coverUrl" TEXT,
    "sampleImages" TEXT,
    "sourceUrl" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssistantThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "messagesJson" TEXT NOT NULL DEFAULT '[]',
    "allowedToolsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssistantTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "usageInputTokens" INTEGER,
    "usageOutputTokens" INTEGER,
    "snapshotJson" TEXT NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "AssistantTurnItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "content" TEXT NOT NULL DEFAULT '',
    "reasoning" TEXT NOT NULL DEFAULT '',
    "toolName" TEXT,
    "displayName" TEXT,
    "argsJson" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "actionJson" TEXT,
    "visualImagesJson" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "AssistantTurnItem_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AssistantTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lighting" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "spatialType" TEXT NOT NULL DEFAULT 'indoor_room',
    "suitableCategories" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "sourceImages" TEXT,
    "reversePrompt" TEXT,
    "dimensions" TEXT,
    "sourceImageIndex" INTEGER,
    "imageType" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'manual',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutfitAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "top" TEXT NOT NULL,
    "bottom" TEXT NOT NULL,
    "shoes" TEXT,
    "colorPalette" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "suitableCategories" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "sourceImages" TEXT,
    "reversePrompt" TEXT,
    "dimensions" TEXT,
    "sourceImageIndex" INTEGER,
    "imageType" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'manual',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActionAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "shotType" TEXT NOT NULL,
    "spatialType" TEXT NOT NULL DEFAULT 'general',
    "camera" TEXT,
    "suitableAnatomy" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "sourceImages" TEXT,
    "reversePrompt" TEXT,
    "dimensions" TEXT,
    "sourceImageIndex" INTEGER,
    "imageType" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'manual',
    "sceneId" TEXT,
    "shotOrder" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActionAsset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "SceneAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "sourceImages" TEXT,
    "reversePrompt" TEXT,
    "dimensions" TEXT,
    "sourceImageIndex" INTEGER,
    "imageType" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'manual',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FullPromptAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "albumName" TEXT,
    "reversePromptZh" TEXT NOT NULL,
    "reversePromptEn" TEXT,
    "dimensions" TEXT,
    "imageType" TEXT,
    "sourceImageIndex" INTEGER,
    "coverUrl" TEXT,
    "sourceImages" TEXT,
    "hasHuman" BOOLEAN NOT NULL DEFAULT true,
    "shotFraming" TEXT,
    "productFrameRatio" INTEGER,
    "sceneSummary" TEXT,
    "outfitSummary" TEXT,
    "actionSummary" TEXT,
    "personaSummary" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "provenance" TEXT NOT NULL DEFAULT 'deconstructed',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Product_itemId_idx" ON "Product"("itemId");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_platform_itemId_key" ON "Product"("platform", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageTask_taskId_key" ON "ImageTask"("taskId");

-- CreateIndex
CREATE INDEX "ImageTask_status_createdAt_idx" ON "ImageTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImageTask_status_idx" ON "ImageTask"("status");

-- CreateIndex
CREATE INDEX "ImageTask_productId_idx" ON "ImageTask"("productId");

-- CreateIndex
CREATE INDEX "ImageTask_createdAt_idx" ON "ImageTask"("createdAt");

-- CreateIndex
CREATE INDEX "ImageTask_mediaType_idx" ON "ImageTask"("mediaType");

-- CreateIndex
CREATE INDEX "PromptRecord_productId_idx" ON "PromptRecord"("productId");

-- CreateIndex
CREATE INDEX "PromptRecord_createdAt_idx" ON "PromptRecord"("createdAt");

-- CreateIndex
CREATE INDEX "StyleRecipe_category_idx" ON "StyleRecipe"("category");

-- CreateIndex
CREATE INDEX "StyleRecipe_isFavorite_idx" ON "StyleRecipe"("isFavorite");

-- CreateIndex
CREATE INDEX "StyleRecipe_createdAt_idx" ON "StyleRecipe"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantThread_updatedAt_idx" ON "AssistantThread"("updatedAt");

-- CreateIndex
CREATE INDEX "AssistantThread_createdAt_idx" ON "AssistantThread"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_threadId_idx" ON "AssistantTurn"("threadId");

-- CreateIndex
CREATE INDEX "AssistantTurn_status_idx" ON "AssistantTurn"("status");

-- CreateIndex
CREATE INDEX "AssistantTurnItem_turnId_idx" ON "AssistantTurnItem"("turnId");

-- CreateIndex
CREATE INDEX "SceneAsset_category_idx" ON "SceneAsset"("category");

-- CreateIndex
CREATE INDEX "SceneAsset_spatialType_idx" ON "SceneAsset"("spatialType");

-- CreateIndex
CREATE INDEX "SceneAsset_isFavorite_idx" ON "SceneAsset"("isFavorite");

-- CreateIndex
CREATE INDEX "SceneAsset_createdAt_idx" ON "SceneAsset"("createdAt");

-- CreateIndex
CREATE INDEX "OutfitAsset_category_idx" ON "OutfitAsset"("category");

-- CreateIndex
CREATE INDEX "OutfitAsset_isFavorite_idx" ON "OutfitAsset"("isFavorite");

-- CreateIndex
CREATE INDEX "OutfitAsset_createdAt_idx" ON "OutfitAsset"("createdAt");

-- CreateIndex
CREATE INDEX "ActionAsset_shotType_idx" ON "ActionAsset"("shotType");

-- CreateIndex
CREATE INDEX "ActionAsset_spatialType_idx" ON "ActionAsset"("spatialType");

-- CreateIndex
CREATE INDEX "ActionAsset_sceneId_idx" ON "ActionAsset"("sceneId");

-- CreateIndex
CREATE INDEX "ActionAsset_isFavorite_idx" ON "ActionAsset"("isFavorite");

-- CreateIndex
CREATE INDEX "ActionAsset_createdAt_idx" ON "ActionAsset"("createdAt");

-- CreateIndex
CREATE INDEX "PersonaAsset_isFavorite_idx" ON "PersonaAsset"("isFavorite");

-- CreateIndex
CREATE INDEX "PersonaAsset_createdAt_idx" ON "PersonaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "FullPromptAsset_category_idx" ON "FullPromptAsset"("category");

-- CreateIndex
CREATE INDEX "FullPromptAsset_isFavorite_idx" ON "FullPromptAsset"("isFavorite");

-- CreateIndex
CREATE INDEX "FullPromptAsset_createdAt_idx" ON "FullPromptAsset"("createdAt");

-- CreateIndex
CREATE INDEX "FullPromptAsset_albumName_idx" ON "FullPromptAsset"("albumName");

