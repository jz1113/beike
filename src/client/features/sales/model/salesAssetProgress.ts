import type { SalesCreativeAsset } from '@shared/domain/sales';
import { canResubmitRejectedAsset } from './salesAssetHelpers';

export function salesAssetRecovery(asset: SalesCreativeAsset): 'query' | 'verify' | null {
  if (!['generating', 'uncertain'].includes(asset.status || '')) return null;
  if (canResubmitRejectedAsset(asset)) return null;
  return asset.taskId || asset.submissionKey ? 'query' : 'verify';
}

export function salesAssetProgress(assets: SalesCreativeAsset[]) {
  const generated = assets.filter((asset) => asset.url && asset.status === 'done');
  return {
    total: assets.length,
    generated: generated.length,
    confirmed: generated.filter((asset) => asset.validation === 'passed').length,
    required: assets.filter((asset) => asset.required).length,
    requiredGenerated: generated.filter((asset) => asset.required).length,
    failed: assets.filter((asset) => asset.status === 'failed').length,
    queryable: assets.some((asset) => salesAssetRecovery(asset) === 'query'),
    unresolved: assets.some((asset) => salesAssetRecovery(asset) === 'verify'),
  };
}
