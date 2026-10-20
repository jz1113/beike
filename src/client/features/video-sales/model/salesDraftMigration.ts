import { emptySalesColorSelection, type SalesColorSelection, type VideoSalesScript } from '@shared/domain/video-sales';

export function readSalesColorSelection(value: unknown): SalesColorSelection {
  if (!value || typeof value !== 'object') return emptySalesColorSelection();
  const raw = value as Partial<SalesColorSelection>;
  const urls = (items: unknown) => Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))] : [];
  return {
    variantId: typeof raw.variantId === 'string' ? raw.variantId : undefined,
    colorLabel: typeof raw.colorLabel === 'string' ? raw.colorLabel : '',
    confirmedImageUrls: urls(raw.confirmedImageUrls), excludedImageUrls: urls(raw.excludedImageUrls),
  };
}

export function normalizeSalesScripts(value: unknown, current: boolean): VideoSalesScript[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VideoSalesScript => Boolean(item && typeof item === 'object' && typeof item.id === 'string'
    && typeof item.title === 'string' && Array.isArray(item.shots) && item.shots.every((shot: unknown) => shot && typeof shot === 'object'
      && 'shotId' in shot && typeof shot.shotId === 'number' && 'duration' in shot && typeof shot.duration === 'number')))
    .map((script) => ({
      ...script,
      assets: Array.isArray(script.assets) ? script.assets.filter((asset) => asset && typeof asset.id === 'string' && typeof asset.prompt === 'string')
        .map((asset) => ({ ...asset, status: asset.status === 'generating' ? 'uncertain' : asset.status })) : undefined,
      ...(current && script.workflowVersion === 3 ? {} : { planStale: true, finalizedRevision: undefined, assetValidation: 'pending' as const }),
      // A browser may close after the request reached the provider but before a receipt arrived.
      ...(script.renderStatus === 'generating' && !script.renderTaskId ? { renderStatus: 'uncertain' as const, renderError: '上次提交结果未确认，请核对服务端生成记录' } : {}),
    }));
}
