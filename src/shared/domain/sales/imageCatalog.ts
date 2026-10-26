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

export function inferSalesCategory(text: string): VideoSalesCategory {
  if (/美妆|护肤|彩妆|口红|面膜|精华|防晒/.test(text)) return 'beauty';
  if (/食品|零食|茶|咖啡|饮料|牛奶|糖/.test(text)) return 'food';
  if (/家居|家纺|纸巾|清洁|收纳|厨|日用/.test(text)) return 'home';
  if (/服饰|鞋|包|衣|裤|裙/.test(text)) return 'fashion';
  if (/数码|手机|耳机|电脑|充电|3c|电子/i.test(text)) return 'tech';
  return 'other';
}

const salesPricePropertyKey = /^(价格|售价|单价|促销价|券后价|到手价|活动价|参考价|原价|吊牌价|市场价|price)$/i;
const salesNoisyPropertyKey = /^(商品毛重|毛重|净重|商品编号|编号|货号|款号|条形码|是否可定制|可定制|是否商场同款|商场同款|店铺|卖家|包装清单|质保|保修|运费|发货地)$/i;
const salesNoisyValue = /^(不可定制|否|无|其他|其它|-|--|暂无)$/i;

function propPriority(key: string): number {
  if (/材质|面料|成分|里料|填充/.test(key)) return 1;
  if (/规格|容量|含量|尺寸|尺码|颜色|色号/.test(key)) return 2;
  if (/版型|款式|领型|袖长|袖型|衣长|裤型|裙长|穿着方式|门襟|闭合/.test(key)) return 3;
  if (/图案|流行元素|风格|工艺|设计|细节|功效|功能|特点|卖点/.test(key)) return 4;
  if (/厚度|弹性|软硬|适用季节|季节|适用场景|场景|适用人群|适用对象/.test(key)) return 5;
  return 6;
}

export function omitSalesPriceProps(props: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!salesPricePropertyKey.test(key.trim())) next[key] = value;
  }
  return next;
}

export function cleanSalesProductProps(props: Record<string, string>, brand?: string): [string, string][] {
  const cleaned = Object.entries(omitSalesPriceProps(props))
    .map(([key, value]) => [key.trim(), value.trim()] as [string, string])
    .filter(([key, value]) => {
      if (!key || !value) return false;
      if (salesNoisyPropertyKey.test(key) || salesNoisyValue.test(value)) return false;
      if ((key === '商品分类' || key === '分类' || key === '类目') && /^\d+$/.test(value)) return false;
      if (key === '品牌' && (brand?.trim() || Object.keys(props).length > 1)) return false;
      return true;
    });
  return cleaned.sort((a, b) => propPriority(a[0]) - propPriority(b[0]));
}

export function omitSalesPriceClauses(text: string): string {
  return text
    .split(/[；;\n]/)
    .map((part) => part.trim())
    .filter((part) => part && !salesPricePropertyKey.test(part.split(/[:：]/, 1)[0]?.trim() || ''))
    .join('；');
}

export function sellingPointsFromProps(props: Record<string, string>): string {
  return cleanSalesProductProps(props, props['品牌'])
    .slice(0, 8)
    .map(([key, value]) => `${key}：${value}`)
    .join('；');
}

export function usableSalesImages(images: SalesImageRef[]): SalesImageRef[] {
  return images.filter((image) => image.url.trim() && !image.unavailable);
}

export function appendSalesImages(images: SalesImageRef[], urls: string[], role: SalesImageRole = 'main'): SalesImageRef[] {
  const next = images.map((image) => ({ ...image }));
  let nextIndex = images.reduce((max, image) => Math.max(max, image.index + 1), 0);
  const seen = new Set(next.map((image) => image.url));
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    next.push({ index: nextIndex++, url, role });
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
