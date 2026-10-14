import { normalizeImageSource } from '@shared/domain/media/drawing';

/** Shared field precedence for single-product and batch collection. */
export function normalizeCollectedImages(data: { product?: Record<string, unknown>; images?: Record<string, unknown> }) {
  const prod = data.product || {};
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.map(normalizeImageSource).filter(Boolean) : [];
  const first = (...values: unknown[]) => values.map(strings).find(items => items.length > 0) || [];
  const mainImgs = first(prod.mainImages, data.images?.main, prod.images);
  const skuImgs = first(prod.skuImages, data.images?.skus);
  const descImgs = first(prod.detailImages, prod.descImages, data.images?.details);
  const allImgs = [...new Set([...mainImgs, ...skuImgs, ...descImgs, ...strings(prod.images)])];
  const coverImg = [prod.coverImage, prod.picUrl, mainImgs[0], allImgs[0]].map(normalizeImageSource).find(Boolean) || '';
  return { mainImgs, skuImgs, descImgs, allImgs, coverImg };
}
