import { sanitizeCollectedItem } from './collectorUrls';

/** Build the workshop input from real, usable sources without inventing product fields. */
export function buildCollectorWorkshopPayload(raw: any) {
  const item = sanitizeCollectedItem(raw);
  if (!item?.images?.length) return null;
  const allImages: string[] = item.images;
  const main: string[] = item.mainImages || [];
  const skus: string[] = item.skuImages || [];
  const details: string[] = item.descImages || [];
  const grouped = new Set([...main, ...skus, ...details]);
  return {
    product: {
      title: item.title || '精选采集商品',
      ...(item.price !== undefined && item.price !== null && item.price !== '' ? { price: item.price } : {}),
      ...(item.category ? { category: item.category } : {}),
      ...(item.skuId ? { skuId: item.skuId } : {}),
      ...(item.itemId ? { itemId: item.itemId } : {}),
      ...(item.platform ? { platform: item.platform } : {}),
    },
    images: {
      main: [...main, ...allImages.filter(url => !grouped.has(url))],
      skus,
      details,
    },
  };
}
