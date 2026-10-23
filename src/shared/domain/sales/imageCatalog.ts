import type { VideoSalesCategory, VideoSalesShot } from './types';

export type SalesImageRole = 'main' | 'sku' | 'detail';

export interface SalesImageRef {
  index: number;
  url: string;
  role: SalesImageRole;
  unavailable?: boolean;
}

export interface ImageAssignment {
  shotId: number;
  imageIndex: number;
  reason?: string;
}

const ROLE_RANK: Record<SalesImageRole, number> = { main: 0, sku: 1, detail: 2 };

export function buildSalesImageCatalog(input: {
  mainImages?: string[];
  skuImages?: string[];
  descImages?: string[];
}): SalesImageRef[] {
  const seen = new Set<string>();
  const images: SalesImageRef[] = [];
  const push = (role: SalesImageRole, urls?: string[]) => {
    for (const raw of urls || []) {
      const url = raw.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      images.push({ index: images.length, url, role });
    }
  };
  push('main', input.mainImages);
  push('sku', input.skuImages);
  push('detail', input.descImages);
  return images;
}

/** 视觉模型只看主图、规格图和少量详情图，编号仍对应完整目录。 */
export function visionImageBudget(images: SalesImageRef[], limit = 8): SalesImageRef[] {
  const unique = images.filter((image, index) => image.url.trim() && images.findIndex((item) => item.url === image.url) === index);
  const ordered = [...unique].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.index - b.index);
  return ordered.slice(0, Math.max(1, limit));
}

export function applyImageAssignments(shots: VideoSalesShot[], assignments: ImageAssignment[], imageCount: number): VideoSalesShot[] {
  const byShot = new Map(assignments.map((item) => [item.shotId, item.imageIndex]));
  return shots.map((shot, ordinal) => {
    const fallback = imageCount > 0 ? ordinal % imageCount : 0;
    const raw = byShot.get(shot.shotId);
    const imageIndex = typeof raw === 'number' && imageCount > 0 && raw >= 0 && raw < imageCount ? raw : fallback;
    return { ...shot, imageIndex, assetUrl: undefined, status: 'pending' };
  });
}

export function removeCatalogImage(images: SalesImageRef[], index: number): SalesImageRef[] {
  return images.filter((image) => image.index !== index).map((image, next) => ({ ...image, index: next }));
}

export function remapShotAfterImageRemoval(shot: VideoSalesShot, removed: number): VideoSalesShot {
  if (typeof shot.imageIndex !== 'number') return shot;
  if (shot.imageIndex === removed) return { ...shot, imageIndex: 0, assetUrl: undefined, referenceFrameUrl: undefined, status: 'pending' };
  if (shot.imageIndex > removed) return { ...shot, imageIndex: shot.imageIndex - 1 };
  return shot;
}

export function shotReferenceImage(shot: { imageIndex?: number }, images: string[], ordinal: number): string {
  if (typeof shot.imageIndex === 'number' && images[shot.imageIndex]) return images[shot.imageIndex];
  if (images.length === 0) return '';
  return images[ordinal % images.length] || '';
}

export function inferSalesCategory(text: string): VideoSalesCategory {
  if (/美妆|护肤|彩妆|口红|面膜|精华|防晒/.test(text)) return 'beauty';
  if (/食品|零食|茶|咖啡|饮料|牛奶|糖/.test(text)) return 'food';
  if (/家居|家纺|纸巾|清洁|收纳|厨|日用/.test(text)) return 'home';
  if (/服饰|鞋|包|衣|裤|裙/.test(text)) return 'fashion';
  if (/数码|手机|耳机|电脑|充电|3c|电子/i.test(text)) return 'tech';
  return 'other';
}

const salesPricePropertyKey = /^(价格|售价|单价|促销价|券后价|到手价|活动价|price)$/i;

export function omitSalesPriceProps(props: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!salesPricePropertyKey.test(key.trim())) next[key] = value;
  }
  return next;
}

export function omitSalesPriceClauses(text: string): string {
  return text
    .split(/[；;\n]/)
    .map((part) => part.trim())
    .filter((part) => part && !salesPricePropertyKey.test(part.split(/[:：]/, 1)[0]?.trim() || ''))
    .join('；');
}

export function sellingPointsFromProps(props: Record<string, string>): string {
  return Object.entries(omitSalesPriceProps(props))
    .filter(([key, value]) => key.trim() && value.trim())
    .slice(0, 8)
    .map(([key, value]) => `${key}：${value}`)
    .join('；');
}

export function usableSalesImages(images: SalesImageRef[]): SalesImageRef[] {
  return images.filter((image) => image.url.trim() && !image.unavailable);
}

export function appendSalesImages(images: SalesImageRef[], urls: string[], role: SalesImageRole = 'main'): SalesImageRef[] {
  const next = images.map((image, index) => ({ ...image, index }));
  const seen = new Set(next.map((image) => image.url));
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    next.push({ index: next.length, url, role });
  }
  return next;
}

export function markSalesImageUnavailable(images: SalesImageRef[], index: number): SalesImageRef[] {
  return images.map((image) => (image.index === index ? { ...image, unavailable: true } : image));
}

export function applyStrictImageAssignments(shots: VideoSalesShot[], assignments: ImageAssignment[], images: SalesImageRef[]): VideoSalesShot[] {
  const valid = new Set(images.map((image) => image.index));
  const byShot = new Map(assignments.map((item) => [item.shotId, item]));
  return shots.map((shot) => {
    const found = byShot.get(shot.shotId);
    if (!found || !valid.has(found.imageIndex)) throw new Error(`镜头 ${shot.shotId} 没有可用参考图`);
    const reason = found.reason?.trim() || '';
    if (!reason) throw new Error(`镜头 ${shot.shotId} 没有选择理由`);
    return {
      ...shot,
      imageIndex: found.imageIndex,
      selectionReason: reason,
      promptStale: false,
      assetUrl: undefined,
      status: 'pending',
      taskId: undefined,
      failReason: undefined,
    };
  });
}
