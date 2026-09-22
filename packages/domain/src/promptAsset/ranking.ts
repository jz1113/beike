import { firstPassAcceptRate, isLowSample, type UsageCounts } from './scoring';

export interface RankableAsset {
  id: string;
  categoryScore: number;
  qualityScore: number | null;
  counts: UsageCounts;
  diversityScore: number;
  favoriteScore: number;
}

export interface RankedAsset {
  id: string;
  score: number;
  reasons: string[];
  strategy: 'heuristic' | 'weighted';
}

export function rankPromptAssets(assets: RankableAsset[], strategy: 'heuristic' | 'weighted' = 'weighted'): RankedAsset[] {
  return assets
    .map((asset) => (strategy === 'heuristic' || isLowSample(asset.counts)
      ? heuristicRank(asset)
      : weightedRank(asset)))
    .sort((a, b) => b.score - a.score);
}

export function heuristicRank(asset: RankableAsset): RankedAsset {
  const score = asset.categoryScore * 0.55 + asset.favoriteScore * 0.25 + asset.diversityScore * 0.2;
  return {
    id: asset.id,
    score,
    strategy: 'heuristic',
    reasons: [
      `类目适配 ${Math.round(asset.categoryScore)}`,
      '样本不足，回退规则排序',
    ],
  };
}

export function weightedRank(asset: RankableAsset): RankedAsset {
  const quality = asset.qualityScore ?? 50;
  const accept = firstPassAcceptRate(asset.counts) * 100;
  const score = asset.categoryScore * 0.35
    + quality * 0.25
    + accept * 0.2
    + asset.diversityScore * 0.1
    + asset.favoriteScore * 0.1;
  return {
    id: asset.id,
    score,
    strategy: 'weighted',
    reasons: [
      `类目适配 35%（${Math.round(asset.categoryScore)}）`,
      `历史质量 25%（${Math.round(quality)}）`,
      `首轮采用率 20%（${Math.round(accept)}）`,
      `多样性 10%（${Math.round(asset.diversityScore)}）`,
      `收藏偏好 10%（${Math.round(asset.favoriteScore)}）`,
    ],
  };
}

export function categoryFitScore(input: {
  linkedCategoryIds: string[];
  targetCategoryId?: string;
  isUniversal?: boolean;
}): number {
  if (input.isUniversal) return 70;
  if (!input.targetCategoryId) return 50;
  if (input.linkedCategoryIds.includes(input.targetCategoryId)) return 100;
  if (input.linkedCategoryIds.length === 0) return 40;
  return 20;
}
