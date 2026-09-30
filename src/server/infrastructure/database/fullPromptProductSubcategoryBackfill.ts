import type { Prisma } from '@prisma/client';
import { inferPromptGroupSubcategory } from '@shared/domain/workshop/workshopPipeline/groupCategoryFit';
import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline/storyboardSlots';

export const fullPromptProductSubcategoryBackfillSource = 'full-prompt-product-subcategory-four-shot-inference-v1';

/** Leave ambiguous groups and any existing human label untouched. */
export async function applyFullPromptProductSubcategoryBackfill(db: Prisma.TransactionClient): Promise<void> {
  const groups = await db.$queryRawUnsafe<Array<{
    id: string;
    title: string;
    shotPromptsJson: string | null;
  }>>(`SELECT "id", "title", "shotPromptsJson" FROM "FullPromptAsset"
    WHERE "productSubcategory" IS NULL AND "shotPromptsJson" IS NOT NULL AND "provenance" <> 'legacy_single'`);
  for (const group of groups) {
    if (parseGroupShotSkeleton(group.shotPromptsJson).length !== 4) continue;
    const subcategory = inferPromptGroupSubcategory(group);
    if (!subcategory) continue;
    await db.$executeRawUnsafe(
      'UPDATE "FullPromptAsset" SET "productSubcategory" = ? WHERE "id" = ? AND "productSubcategory" IS NULL',
      subcategory, group.id,
    );
  }
}
