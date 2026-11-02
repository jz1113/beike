import type { VideoSalesCategory } from './types';

export type SalesScriptStyleCategory =
  | 'street_onetake'
  | 'lifestyle_vlog'
  | 'talking_head'
  | 'detail_proof'
  | 'studio_lookbook'
  | 'home_cozy';

export interface SalesScriptTaxonomy {
  categoryId?: string;
  styleId?: string;
  productCategory: VideoSalesCategory;
  subCategory: string;
  styleCategory: SalesScriptStyleCategory;
}

const VALID_PRODUCT_CATEGORIES = new Set<string>(['fashion', 'beauty', 'food', 'home', 'tech', 'other']);
const VALID_STYLE_CATEGORIES = new Set<string>([
  'street_onetake', 'lifestyle_vlog', 'talking_head', 'detail_proof', 'studio_lookbook', 'home_cozy',
]);

export function isSalesScriptStyleCategory(v: unknown): v is SalesScriptStyleCategory {
  return typeof v === 'string' && VALID_STYLE_CATEGORIES.has(v);
}

export function inferScriptProductCategory(
  explicit: unknown,
  reusableCategories: readonly string[],
  corpus: string,
): VideoSalesCategory {
  if (typeof explicit === 'string' && VALID_PRODUCT_CATEGORIES.has(explicit)) {
    return explicit as VideoSalesCategory;
  }
  for (const cat of reusableCategories) {
    if (VALID_PRODUCT_CATEGORIES.has(cat)) return cat as VideoSalesCategory;
  }
  if (/冲锋衣|开衫|连衣裙|针织|外套|衬衫|裤|裙|穿搭|衣|鞋|包|模特上身/.test(corpus)) return 'fashion';
  if (/护肤|精华|面霜|口红|粉底|面膜|洗发|美妆|彩妆/.test(corpus)) return 'beauty';
  if (/零食|茶|咖啡|饮|奶|食品|冲泡|试吃|口感/.test(corpus)) return 'food';
  if (/数码|手机|耳机|充电|家电|科技|电脑|音箱/.test(corpus)) return 'tech';
  if (/家居|客厅|桌面|收纳|床品|厨房|纸巾|清洁/.test(corpus)) return 'home';
  return 'other';
}

export function inferScriptStyleCategory(input: {
  explicit?: unknown;
  oneTake: boolean;
  format: string;
  voiceMode: string;
  spatialType: string;
  corpus: string;
}): SalesScriptStyleCategory {
  if (isSalesScriptStyleCategory(input.explicit)) return input.explicit;
  const text = input.corpus.toLowerCase();
  if (input.format === 'hands' || input.format === 'product' || /微距|细节测评|手部演示|材质实测/.test(text)) {
    return 'detail_proof';
  }
  if (input.spatialType === 'studio' || /影棚|纯底|大片|lookbook/.test(text)) {
    return 'studio_lookbook';
  }
  if ((input.oneTake && input.spatialType === 'outdoor') || /街拍|一镜到底/.test(text)) {
    return 'street_onetake';
  }
  if (/vlog|法式|松弛|度假|回眸/.test(text) || (input.voiceMode === 'none' && input.format === 'presenter')) {
    return 'lifestyle_vlog';
  }
  if (/治愈|居家|温暖|清晨|原木/.test(text) && input.voiceMode !== 'speech') {
    return 'home_cozy';
  }
  if (input.voiceMode === 'speech') {
    return 'talking_head';
  }
  return 'lifestyle_vlog';
}
