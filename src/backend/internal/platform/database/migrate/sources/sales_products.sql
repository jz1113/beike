CREATE TABLE IF NOT EXISTS "SalesProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "productUrl" TEXT NOT NULL DEFAULT '',
  "collectedProductUrl" TEXT NOT NULL DEFAULT '',
  "platform" TEXT NOT NULL DEFAULT '',
  "sku" TEXT NOT NULL DEFAULT '',
  "brand" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'other',
  "categorySource" TEXT NOT NULL DEFAULT 'auto',
  "audience" TEXT NOT NULL DEFAULT 'unknown',
  "audienceSource" TEXT NOT NULL DEFAULT 'auto',
  "coverUrl" TEXT NOT NULL DEFAULT '',
  "imageCount" INTEGER NOT NULL DEFAULT 0,
  "selectedImageCount" INTEGER NOT NULL DEFAULT 0,
  "hasSummary" INTEGER NOT NULL DEFAULT 0,
  "outputCount" INTEGER NOT NULL DEFAULT 0,
  "draftJson" TEXT NOT NULL DEFAULT '{}',
  "lastOpenedAt" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "SalesProduct_workspace_idx" ON "SalesProduct"("workspaceId", "updatedAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "SalesProduct_filter_idx" ON "SalesProduct"("workspaceId", "category", "audience", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "SalesProduct_source_idx" ON "SalesProduct"("workspaceId", "collectedProductUrl");
