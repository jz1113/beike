import { OFFICIAL_WORKSPACE_ID, requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import { db } from '../../repositories/access';
import {
  categoryFitScore,
  rankPromptAssets,
  type RankableAsset,
  emptyUsageCounts,
} from '@beike/domain/promptAsset';
import { listCategoryLinks, listRegistryByType, listUsageEvents } from '../../repositories/promptAsset';
import { publishedIdsOrNone } from './registry';
import { countsFromEvents } from './scoring';

export async function publishedWhere(assetType: 'scene' | 'outfit' | 'action' | 'persona' | 'full_prompt') {
  const ids = await publishedIdsOrNone(assetType);
  return { id: { in: ids } };
}

export async function rankPublishedAssets(input: {
  assetType: 'scene' | 'outfit' | 'action' | 'persona' | 'full_prompt';
  targetCategoryId?: string;
  usedAssetIds?: string[];
  favoriteIds?: string[];
  strategy?: 'heuristic' | 'weighted';
}) {
  const ids = (await publishedIdsOrNone(input.assetType)).filter((id) => id !== '__none__');
  const remaining = ids.filter((id) => !input.usedAssetIds?.includes(id));
  const registries = await listRegistryByType(input.assetType, remaining);
  const links = await listCategoryLinks(remaining);
  const assets: RankableAsset[] = [];
  for (const row of registries) {
    const events = await listUsageEvents(row.sourceAssetId);
    const categoryIds = links.filter((link) => link.assetId === row.sourceAssetId).map((link) => link.categoryId);
    assets.push({
      id: row.sourceAssetId,
      categoryScore: categoryFitScore({
        linkedCategoryIds: categoryIds,
        targetCategoryId: input.targetCategoryId,
      }),
      qualityScore: row.qualityScore,
      counts: countsFromEvents(events),
      diversityScore: input.usedAssetIds?.includes(row.sourceAssetId) ? 10 : 80,
      favoriteScore: input.favoriteIds?.includes(row.sourceAssetId) ? 100 : 40,
    });
  }
  return rankPromptAssets(assets, input.strategy);
}

export async function listAssetsForCoverage(assetType: 'scene' | 'outfit' | 'action' | 'persona') {
  const table = {
    scene: 'SceneAsset',
    outfit: 'OutfitAsset',
    action: 'ActionAsset',
    persona: 'PersonaAsset',
  }[assetType];
  return db.$queryRawUnsafe<Array<{ id: string; tags: string | null; shotType: string | null; productCategoryIds: string | null }>>(
    `SELECT "id", "tags", ${assetType === 'action' ? '"shotType"' : 'NULL as "shotType"'}, "productCategoryIds" FROM "${table}" WHERE "workspaceId" IN (?, ?)`,
    requireWorkspaceId(),
    OFFICIAL_WORKSPACE_ID,
  ).catch(() => []);
}

export async function sortByQuality<T extends { id: string }>(assetType: 'scene' | 'outfit' | 'action' | 'persona', items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const rows = await listRegistryByType(assetType, items.map((item) => item.id));
  const score = new Map(rows.map((row) => [row.sourceAssetId, row.qualityScore ?? -1]));
  return [...items].sort((a, b) => (score.get(b.id) ?? -1) - (score.get(a.id) ?? -1));
}
