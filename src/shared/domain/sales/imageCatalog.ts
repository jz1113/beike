import type { SalesProductImageView, VideoSalesCategory } from './types';
import { SALES_PRODUCT_IMAGE_VIEWS } from './types';

export type SalesImageRole = 'main' | 'sku' | 'detail';

export interface SalesImageRef {
  index: number;
  url: string;
  role: SalesImageRole;
  view?: SalesProductImageView;
  unavailable?: boolean;
}

export function isSalesProductImageView(value: unknown): value is SalesProductImageView {
  return typeof value === 'string' && (SALES_PRODUCT_IMAGE_VIEWS as readonly string[]).includes(value);
}

export function setSalesImageView(
  images: SalesImageRef[],
  url: string,
  view?: SalesProductImageView,
): SalesImageRef[] {
  return images.map((image) => {
    if (image.url !== url) return image;
    if (!view) {
      const next = { ...image };
      delete next.view;
      return next;
    }
    return { ...image, view };
  });
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
  if (/服饰|服装|女装|男装|童装|内衣|针织|开衫|毛衣|卫衣|外套|夹克|风衣|大衣|羽绒|冲锋衣|衬衫|T恤|裤|牛仔|裙|连衣裙|半身裙|穿搭|鞋|靴|包|配饰|帽|围巾/.test(text)) return 'fashion';
  if (/美妆|护肤|彩妆|口红|唇釉|粉底|气垫|眼影|面膜|精华|面霜|乳液|防晒|洁面|卸妆|香水|洗发|护发|沐浴/.test(text)) return 'beauty';
  if (/食品|零食|茶|咖啡|冲饮|饮料|牛奶|酸奶|坚果|糕点|饼干|糖|巧克力|生鲜|水果|肉|粮油|调味/.test(text)) return 'food';
  if (/数码|手机|耳机|音箱|电脑|平板|键盘|鼠标|相机|充电|数据线|家电|吹风机|吸尘器|3c|电子/i.test(text)) return 'tech';
  if (/家居|家纺|床品|四件套|被|枕|纸巾|湿巾|清洁|洗洁|洗衣|收纳|厨|锅|碗|杯|日用|百货|家具|灯/.test(text)) return 'home';
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

export function sellingPointsFromProps(props: Record<string, string>): string {
  return cleanSalesProductProps(props, props['品牌'])
    .slice(0, 8)
    .map(([key, value]) => `${key}：${value}`)
    .join('；');
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
