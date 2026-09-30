import type { Prisma } from '@prisma/client';
import { inferPromptGroupSubcategory } from '@shared/domain/workshop/workshopPipeline/groupCategoryFit';
import { isPromptGroupSubcategory } from '@shared/domain/assets/promptGroupSubcategory';

export const fullPromptMajorCategoryBackfillSource = 'full-prompt-major-category-explicit-digital-v1';

interface GroupRow {
  id: string;
  workspaceId: string;
  albumId: string | null;
  title: string;
  shotPromptsJson: string | null;
  productCategoryIds: string;
  productSubcategory: string | null;
}

function categories(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(value => typeof value === 'string') ? parsed : [];
  } catch { return []; }
}

function isDigitalGroup(group: GroupRow): boolean {
  return isPromptGroupSubcategory(group.productSubcategory)
    || inferPromptGroupSubcategory(group) !== null;
}

/** Only fill an empty family after every group in its album independently proves a digital subject. */
export async function applyFullPromptMajorCategoryBackfill(db: Prisma.TransactionClient): Promise<void> {
  const digital = await db.$queryRawUnsafe<Array<{ id: string; workspaceId: string }>>(
    'SELECT "id", "workspaceId" FROM "AssetProductCategory" WHERE "id" = ? AND "parentId" IS NULL',
    'digital_3c',
  );
  if (!digital.length) return;

  const albums = await db.$queryRawUnsafe<Array<{ id: string; workspaceId: string; productCategoryId: string | null }>>(
    'SELECT "id", "workspaceId", "productCategoryId" FROM "PromptAlbum"',
  );
  const groups = await db.$queryRawUnsafe<GroupRow[]>(
    `SELECT "id", "workspaceId", "albumId", "title", "shotPromptsJson", "productCategoryIds", "productSubcategory"
      FROM "FullPromptAsset" WHERE "provenance" <> 'legacy_single'`,
  );
  const byAlbum = new Map<string, GroupRow[]>();
  for (const group of groups) {
    if (!group.albumId) continue;
    const key = `${group.workspaceId}:${group.albumId}`;
    byAlbum.set(key, [...(byAlbum.get(key) || []), group]);
  }
  const available = (workspaceId: string) => digital[0].workspaceId === workspaceId || digital[0].workspaceId === 'official';

  for (const album of albums) {
    if (album.productCategoryId || !available(album.workspaceId)) continue;
    const members = byAlbum.get(`${album.workspaceId}:${album.id}`) || [];
    if (!members.length || members.some(group => {
      const ids = categories(group.productCategoryIds);
      return ids.length ? ids.length !== 1 || ids[0] !== 'digital_3c' : !isDigitalGroup(group);
    })) continue;
    await db.$executeRawUnsafe(
      'UPDATE "PromptAlbum" SET "productCategoryId" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryId" IS NULL',
      'digital_3c', album.id, album.workspaceId,
    );
    for (const group of members) {
      if (categories(group.productCategoryIds).length) continue;
      await db.$executeRawUnsafe(
        'UPDATE "FullPromptAsset" SET "productCategoryIds" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = ?',
        '["digital_3c"]', group.id, group.workspaceId, group.productCategoryIds,
      );
    }
  }

  // An older stand-alone group has no album to synchronize.
  for (const group of groups) {
    if (group.albumId || !available(group.workspaceId) || categories(group.productCategoryIds).length || !isDigitalGroup(group)) continue;
    await db.$executeRawUnsafe(
      'UPDATE "FullPromptAsset" SET "productCategoryIds" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = ?',
      '["digital_3c"]', group.id, group.workspaceId, group.productCategoryIds,
    );
  }
}
