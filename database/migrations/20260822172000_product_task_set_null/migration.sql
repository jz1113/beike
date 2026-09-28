-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImageTask" (
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
INSERT INTO "new_ImageTask" ("id", "productId", "prompt", "taskId", "status", "resultUrl", "failReason", "model", "mediaType", "size", "quality", "createdAt", "updatedAt") SELECT "id", "productId", "prompt", "taskId", "status", "resultUrl", "failReason", "model", "mediaType", "size", "quality", "createdAt", "updatedAt" FROM "ImageTask";
DROP TABLE "ImageTask";
ALTER TABLE "new_ImageTask" RENAME TO "ImageTask";
CREATE UNIQUE INDEX "ImageTask_taskId_key" ON "ImageTask"("taskId");
CREATE INDEX "ImageTask_status_idx" ON "ImageTask"("status");
CREATE INDEX "ImageTask_productId_idx" ON "ImageTask"("productId");
CREATE INDEX "ImageTask_createdAt_idx" ON "ImageTask"("createdAt");
CREATE INDEX "ImageTask_mediaType_idx" ON "ImageTask"("mediaType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
