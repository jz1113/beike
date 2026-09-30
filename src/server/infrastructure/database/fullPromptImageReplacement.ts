import type { Prisma } from '@prisma/client';

export const fullPromptImageReplacementSql = `
CREATE TABLE IF NOT EXISTS "FullPromptImageReplacement" (
  "motherAssetId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
  "reviewId" TEXT NOT NULL UNIQUE,
  "sourceSnapshotJson" TEXT NOT NULL,
  "generatedImagesJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FullPromptImageReplacement_workspaceId_idx"
  ON "FullPromptImageReplacement"("workspaceId");
`;

export async function applyFullPromptImageReplacement(db: Prisma.TransactionClient): Promise<void> {
  for (const statement of fullPromptImageReplacementSql.split(';').map(sql => sql.trim()).filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}
