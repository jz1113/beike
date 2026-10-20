import { salesContentRevision, type SalesCreativeAsset, type VideoSalesScript } from '@shared/domain/video-sales';

/** Keep receipts/history separate; only completed images with unchanged creative inputs are reusable. */
export function reuseSalesPlanAssets(next: VideoSalesScript, previous?: VideoSalesScript): VideoSalesScript {
  if (!previous || next.planRevision !== previous.planRevision) return next;
  const creative = (asset: SalesCreativeAsset) => salesContentRevision({
    id: asset.id, kind: asset.kind, prompt: asset.prompt, usesProduct: asset.usesProduct,
    referenceAssetIds: asset.referenceAssetIds || [],
  });
  return { ...next, assets: next.assets?.map((asset) => {
    const old = previous.assets?.find((item) => item.id === asset.id && creative(item) === creative(asset));
    return old?.status === 'done' && old.url ? {
      ...asset, url: old.url, status: 'done', sourceRevision: old.sourceRevision,
      validation: 'pending', modelId: old.modelId, attempts: old.attempts,
    } : asset;
  }), assetValidation: 'pending' };
}
