import type { Prisma } from '@prisma/client';

export const fullPromptProductSubcategorySql = `
ALTER TABLE "FullPromptAsset" ADD COLUMN "productSubcategory" TEXT;
CREATE INDEX IF NOT EXISTS "FullPromptAsset_productSubcategory_idx"
  ON "FullPromptAsset"("productSubcategory");
`;

export async function applyFullPromptProductSubcategory(db: Prisma.TransactionClient): Promise<void> {
  const columns = await db.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("FullPromptAsset")');
  if (!columns.some(column => column.name === 'productSubcategory')) {
    await db.$executeRawUnsafe('ALTER TABLE "FullPromptAsset" ADD COLUMN "productSubcategory" TEXT');
  }
  await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "FullPromptAsset_productSubcategory_idx" ON "FullPromptAsset"("productSubcategory")');
}
