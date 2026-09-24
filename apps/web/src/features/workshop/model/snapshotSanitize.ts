import { isEphemeralResultUrl } from './workspaceRecovery';
import type { BatchProductItem } from './batchTypes';

export function sanitizePersistedUrl(url?: string): string | undefined {
  if (!url || isEphemeralResultUrl(url)) return undefined;
  return url;
}

export function sanitizeBatchItem<T extends BatchProductItem>(item: T): T {
  const keep = (url: string) => sanitizePersistedUrl(url) || '';
  return {
    ...item,
    coverImage: keep(item.coverImage),
    mainImages: item.mainImages.map(keep).filter(Boolean),
    skuImages: item.skuImages.map(keep).filter(Boolean),
    detailImages: item.detailImages.map(keep).filter(Boolean),
    selectedProductImages: item.selectedProductImages.map(keep).filter(Boolean),
    allTypedImages: (item.allTypedImages || []).map((image) => ({ ...image, url: keep(image.url) })).filter((image) => image.url),
    tasks: (item.tasks || []).map((task) => ({
      ...task,
      resultUrl: sanitizePersistedUrl(task.resultUrl),
    })),
  };
}
