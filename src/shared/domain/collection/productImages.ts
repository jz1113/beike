import { collectedProductImageIdentity, collectedProductImageQuality, normalizeCollectedProductImage, parseCollectedProductImage } from '../media/productImageUrls';

export interface CollectedImageInput {
  product?: Record<string, unknown>;
  images?: unknown;
}

export interface CollectedImageGroups {
  mainImgs: string[];
  skuImgs: string[];
  descImgs: string[];
  allImgs: string[];
  coverImg: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decoded(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function imageList(...sources: unknown[]): string[] {
  return sources.flatMap(source => {
    const list = decoded(source);
    return (Array.isArray(list) ? list : [list]).flatMap(value => {
      const image = parseCollectedProductImage(value);
      return image ? [image.url] : [];
    });
  });
}

/** Merge aliases without losing uncategorized images; one asset belongs to one category only. */
export function normalizeCollectedProductImages(input: CollectedImageInput): CollectedImageGroups {
  const p = input.product || {};
  const images = record(input.images);
  const legacyValue = decoded(p.detailUrls);
  const legacy = record(legacyValue);
  const groups = [
    imageList(p.mainImages, images.main, legacy.main),
    imageList(p.skuImages, images.skus, legacy.skus),
    imageList(p.detailImages, p.descImages, images.details, legacy.details, legacy.images, Array.isArray(legacyValue) ? legacyValue : []),
  ];
  const classified = new Set(groups.flat().map(collectedProductImageIdentity));
  const extra = imageList(p.images, Array.isArray(input.images) ? input.images : [], p.coverImage, p.picUrl);
  for (const source of extra) {
    const id = collectedProductImageIdentity(source);
    if (!classified.has(id)) {
      groups[0].push(source);
      classified.add(id);
    }
  }
  // Select quality globally, retaining the first category and position for each asset.
  const best = new Map<string, string>();
  for (const source of [...groups.flat(), ...extra]) {
    const id = collectedProductImageIdentity(source);
    const previous = best.get(id);
    if (!previous || collectedProductImageQuality(source) > collectedProductImageQuality(previous)) best.set(id, source);
  }
  const seen = new Set<string>();
  const [mainImgs, skuImgs, descImgs] = groups.map(group => group.flatMap(source => {
    const id = collectedProductImageIdentity(source);
    if (seen.has(id)) return [];
    seen.add(id);
    const selected = normalizeCollectedProductImage(best.get(id) || source);
    return selected ? [selected] : [];
  }));
  const allImgs = [...mainImgs, ...skuImgs, ...descImgs];
  const requestedCover = imageList(p.coverImage, p.picUrl)[0];
  const coverImg = (requestedCover && normalizeCollectedProductImage(best.get(collectedProductImageIdentity(requestedCover)))) || allImgs[0] || '';
  return { mainImgs, skuImgs, descImgs, allImgs, coverImg };
}
