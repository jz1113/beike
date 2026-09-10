/** Shared field precedence for single-product and batch collection. */
export function normalizeCollectedImages(data: { product?: Record<string, unknown>; images?: Record<string, unknown> }) {
  const prod = data.product || {};
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
  const first = (...values: unknown[]) => values.map(strings).find(items => items.length > 0) || [];
  const mainImgs = first(prod.mainImages, prod.images, data.images?.main);
  const skuImgs = first(prod.skuImages, data.images?.skus);
  const descImgs = first(prod.detailImages, prod.descImages, data.images?.details);
  const allImgs = [...new Set([...mainImgs, ...skuImgs, ...descImgs])];
  const coverImg = [prod.coverImage, prod.picUrl, mainImgs[0], allImgs[0]]
    .find((value): value is string => typeof value === 'string' && !!value.trim()) || '';
  return { mainImgs, skuImgs, descImgs, allImgs, coverImg };
}
