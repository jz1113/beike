import {
  APPEARANCE_AUDIENCES,
  appearanceAudience,
  type AppearanceAudience,
} from '../assets/appearanceAudience';
import type { VideoSalesCategory } from './types';

export type { AppearanceAudience };

export interface PersonaAudienceInput {
  name: string;
  description: string;
  tags: string;
  dimensions?: string;
}

export type SalesClassificationSource = 'auto' | 'manual';

export const SALES_PRODUCT_CATEGORIES: readonly { id: VideoSalesCategory; label: string }[] = [
  { id: 'fashion', label: '服饰' },
  { id: 'beauty', label: '美妆' },
  { id: 'food', label: '食品' },
  { id: 'home', label: '家居' },
  { id: 'tech', label: '数码' },
  { id: 'other', label: '其他' },
];

export const SALES_PRODUCT_CATEGORY_LABELS: Record<VideoSalesCategory, string> = {
  fashion: '服饰',
  beauty: '美妆',
  food: '食品',
  home: '家居',
  tech: '数码',
  other: '其他',
};

export const SALES_PRODUCT_AUDIENCE_OPTIONS: readonly { id: AppearanceAudience; label: string }[] = [
  { id: 'adult_female', label: '成年女' },
  { id: 'adult_male', label: '成年男' },
  { id: 'adult_unisex', label: '成年通用' },
  { id: 'senior_female', label: '老年女' },
  { id: 'senior_male', label: '老年男' },
  { id: 'senior_unisex', label: '老年通用' },
  { id: 'child_female', label: '女童' },
  { id: 'child_male', label: '男童' },
  { id: 'child_unisex', label: '儿童通用' },
  { id: 'unknown', label: '待分类' },
];

export type SalesAudienceFilter =
  | 'all'
  | 'adult_female'
  | 'adult_male'
  | 'senior'
  | 'child'
  | 'unisex'
  | 'unknown';

export const SALES_PRODUCT_AUDIENCE_FILTERS: readonly { id: SalesAudienceFilter; label: string }[] = [
  { id: 'all', label: '全部人群' },
  { id: 'adult_female', label: '成年女' },
  { id: 'adult_male', label: '成年男' },
  { id: 'senior', label: '老年' },
  { id: 'child', label: '儿童' },
  { id: 'unisex', label: '通用' },
  { id: 'unknown', label: '待分类' },
];

export interface SalesProductClassificationInput {
  productName?: string;
  brand?: string;
  sellingPoints?: string;
  props?: Record<string, string>;
  category?: VideoSalesCategory;
}

const VALID_CATEGORIES = new Set<string>(SALES_PRODUCT_CATEGORIES.map((item) => item.id));
const VALID_AUDIENCES = new Set<string>(APPEARANCE_AUDIENCES.map((item) => item.id));

/** 校验是否为合法的电商视频商品品类 */
export function isSalesProductCategory(value: unknown): value is VideoSalesCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value);
}

/** 校验是否为合法的商品适用人群枚举 */
export function isSalesProductAudience(value: unknown): value is AppearanceAudience {
  return typeof value === 'string' && VALID_AUDIENCES.has(value);
}

/** 获取适用人群的中文展示标签 */
export function salesAudienceLabel(audience: AppearanceAudience | undefined): string {
  const hit = APPEARANCE_AUDIENCES.find((item) => item.id === audience);
  return hit ? hit.label : '待分类';
}

function collectClassificationText(input: SalesProductClassificationInput): string {
  const propPairs = Object.entries(input.props || {})
    .map(([key, val]) => `${key}:${val}`)
    .join(' ');
  return [input.productName, input.brand, input.sellingPoints, propPairs]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .join(' ');
}

/** 根据商品标题、品牌与属性表自动推断商品品类 */
export function inferSalesProductCategory(input: SalesProductClassificationInput): VideoSalesCategory {
  const text = collectClassificationText(input).toLowerCase();
  if (!text) return 'other';
  if (/耳机|手机|电脑|键盘|鼠标|充电|移动电源|音响|相机|投影|平板|路由器|智能手表|数据线|数码|电器|吹风机/.test(text)) {
    return 'tech';
  }
  if (/面霜|精华|口红|粉底|眼霜|防晒|洁面|洗面奶|护肤|彩妆|香水|面膜|乳液|洗发|沐浴|唇釉|卸妆|美妆/.test(text)) {
    return 'beauty';
  }
  if (/零食|咖啡|茶|饼干|巧克力|坚果|牛奶|饮料|麦片|牛肉|火锅|调味|糕点|水果|保健食品|净含量|保质期/.test(text)) {
    return 'food';
  }
  if (/女装|男装|童装|针织|开衫|毛衣|连衣裙|半身裙|外套|风衣|大衣|羽绒服|卫衣|衬衫|牛仔裤|阔腿裤|西装|T恤|内衣|睡衣|鞋|靴|包|穿搭|尺码/.test(text)) {
    return 'fashion';
  }
  if (/沙发|床垫|四件套|枕头|被子|收纳|厨房|餐具|锅|杯|纸巾|洗衣液|清洁|灯具|窗帘|地毯|家居|家纺/.test(text)) {
    return 'home';
  }
  return 'other';
}

/** 根据商品标题与属性表推断商品适用年龄段与性别 */
export function inferSalesProductAudience(input: SalesProductClassificationInput): AppearanceAudience {
  const text = collectClassificationText(input);
  if (!text.trim()) return 'unknown';

  const hasChild = /童装|儿童|女童|男童|宝宝|婴幼|小孩|少儿|中大童|小学生|\b(?:kids?|child|children|toddler|baby)\b/i.test(text);
  const hasSenior = /中老年|老年|老人|妈妈装|奶奶装|爸爸装|爷爷装|银发|长者|\b(?:senior|elderly)\b/i.test(text);

  const explicitUnisex = /男女通用|男女同款|男女童|男女宝|男女生|男女皆可|情侣款|情侣装|中性款|全家适用|\bunisex\b/i.test(text);
  const hasFemale = /女装|女士|女款|女童|女孩|妈妈装|奶奶装|连衣裙|半身裙|百褶裙|吊带裙|抹胸|旗袍|口红|唇釉|粉底|\b(?:womenswear|women|female|girl)\b/i.test(text);
  const hasMale = /男装|男士|男款|男童|男孩|爸爸装|爷爷装|剃须刀|\b(?:menswear|men|male|boy)\b/i.test(text);

  const age: 'child' | 'senior' | 'adult' | null = hasChild && !hasSenior
    ? 'child'
    : hasSenior && !hasChild
      ? 'senior'
      : (hasFemale || hasMale || explicitUnisex || /成年|成人|青年|通勤|职场/.test(text))
        ? 'adult'
        : null;

  if (!age) return 'unknown';
  if (explicitUnisex || (hasFemale && hasMale)) return `${age}_unisex`;
  if (hasFemale) return `${age}_female`;
  if (hasMale) return `${age}_male`;
  return `${age}_unisex`;
}

/** 合并自动推断结果与用户人工分类覆盖，人工修改后不会被重新采集冲掉 */
export function resolveSalesProductClassification(
  input: SalesProductClassificationInput,
  current: {
    category?: VideoSalesCategory;
    categorySource?: SalesClassificationSource;
    audience?: AppearanceAudience;
    audienceSource?: SalesClassificationSource;
  },
): {
  category: VideoSalesCategory;
  categorySource: SalesClassificationSource;
  audience: AppearanceAudience;
  audienceSource: SalesClassificationSource;
} {
  const categorySource: SalesClassificationSource = current.categorySource === 'manual' ? 'manual' : 'auto';
  const audienceSource: SalesClassificationSource = current.audienceSource === 'manual' ? 'manual' : 'auto';

  const inferredCategory = input.category && input.category !== 'other'
    ? input.category
    : inferSalesProductCategory(input);
  const category = categorySource === 'manual' && isSalesProductCategory(current.category)
    ? current.category
    : inferredCategory;

  const audience = audienceSource === 'manual' && isSalesProductAudience(current.audience)
    ? current.audience
    : inferSalesProductAudience({ ...input, category });

  return { category, categorySource, audience, audienceSource };
}

/** 判断商品人群是否命中资产库的聚合人群筛选标签 */
export function matchesProductAudienceFilter(
  audience: AppearanceAudience | undefined,
  filter: SalesAudienceFilter,
): boolean {
  const resolved = isSalesProductAudience(audience) ? audience : 'unknown';
  if (filter === 'all') return true;
  if (filter === 'adult_female') return resolved === 'adult_female';
  if (filter === 'adult_male') return resolved === 'adult_male';
  if (filter === 'senior') return resolved.startsWith('senior_');
  if (filter === 'child') return resolved.startsWith('child_');
  if (filter === 'unisex') return resolved.endsWith('_unisex');
  return resolved === 'unknown';
}

/** 推断出镜人物自身的精细人群标识（年龄 + 性别） */
export function resolvePersonaAudience(persona: PersonaAudienceInput): AppearanceAudience {
  const detected = appearanceAudience({
    name: persona.name,
    description: persona.description,
    tags: persona.tags,
    dimensions: persona.dimensions,
  });
  if (detected !== 'unknown') return detected;

  const text = `${persona.name} ${persona.tags} ${persona.description}`.toLowerCase();
  const isChild = /儿童|童|小孩|男孩|女孩|宝宝|少儿/.test(text);
  const isSenior = /老年|老人|老爷爷|老奶奶|银发|长者|大爷|大妈/.test(text);
  const isMale = /男|先生|子轩|博文|小哥|大叔|绅士/.test(text) && !/女/.test(text);
  const age = isChild ? 'child' : isSenior ? 'senior' : 'adult';
  const gender = isMale ? 'male' : 'female';
  return `${age}_${gender}`;
}

/** 判断候选出镜人物是否与当前商品的适用人群（年龄段 + 性别）严格匹配 */
export function isPersonaCompatibleWithProductAudience(
  persona: PersonaAudienceInput,
  productAudience: AppearanceAudience | undefined,
): boolean {
  if (!productAudience || productAudience === 'unknown') return true;
  const personaAudience = resolvePersonaAudience(persona);
  if (personaAudience === 'unknown') return false;
  const [personaAge, personaGender] = personaAudience.split('_');
  const [productAge, productGender] = productAudience.split('_');
  if (personaAge !== productAge) return false;
  if (productGender === 'unisex') return true;
  return personaGender === productGender;
}
