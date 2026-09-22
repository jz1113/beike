import { buildCoverageMatrix, coverageGaps } from '@beike/domain/promptAsset';
import { listAssetsForCoverage, rankPublishedAssets } from './recall';

function parseCategoryIds(raw: string | null): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function buildAssetCoverage(categoryIds: string[]) {
  const actions = await listAssetsForCoverage('action');
  const slots = buildCoverageMatrix({
    categoryIds,
    assets: actions.map((row) => ({
      categoryIds: parseCategoryIds(row.productCategoryIds),
      shotScale: row.shotType || row.tags || undefined,
      actionSlot: row.tags || undefined,
    })),
  });
  const ranked = await rankPublishedAssets({ assetType: 'action' });
  const heuristic = await rankPublishedAssets({ assetType: 'action', strategy: 'heuristic' });
  return {
    slots,
    gaps: coverageGaps(slots),
    rankingAb: {
      control: heuristic.slice(0, 12),
      experiment: ranked.slice(0, 12),
    },
  };
}
