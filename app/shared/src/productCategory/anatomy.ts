/**
 * 解剖学关键穿戴部位、动作锚点解析与徽章计算
 */
import { ActionCategoryId, SubCategoryDef } from './defs';
import { inferProductCategoryAndAnatomy } from './infer';
import { getSubCategoriesForCategory } from './subcategoryStore';

export interface ActionCategoryBadge {
  id: ActionCategoryId;
  label: string;
  colorClass: string;
}

export const ACTION_CATEGORY_BADGES: Record<ActionCategoryId, ActionCategoryBadge> = {
  jewelry: { id: 'jewelry', label: '首饰', colorClass: 'bg-amber-50 text-amber-800 border-amber-200/80' },
  digital_3c: { id: 'digital_3c', label: '手机数码', colorClass: 'bg-violet-50 text-violet-800 border-violet-200/80' },
  apparel: { id: 'apparel', label: '服饰', colorClass: 'bg-sky-50 text-sky-800 border-sky-200/80' },
  bag: { id: 'bag', label: '箱包', colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' },
  shoes: { id: 'shoes', label: '鞋靴', colorClass: 'bg-rose-50 text-rose-800 border-rose-200/80' },
  beauty: { id: 'beauty', label: '美妆', colorClass: 'bg-pink-50 text-pink-800 border-pink-200/80' },
  eyewear: { id: 'eyewear', label: '眼镜', colorClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80' },
  universal: { id: 'universal', label: '通用', colorClass: 'bg-slate-100 text-slate-700 border-slate-200/80' },
};

export const ANATOMY_TOKEN_CATEGORY: Record<string, ActionCategoryId> = {
  jewelry: 'jewelry',
  necklace: 'jewelry',
  earring: 'jewelry',
  bracelet: 'jewelry',
  ring: 'jewelry',
  hairpin: 'jewelry',
  brooch: 'jewelry',
  pendant: 'jewelry',
  digital: 'digital_3c',
  digital_3c: 'digital_3c',
  phone: 'digital_3c',
  smartphone: 'digital_3c',
  phonecase: 'digital_3c',
  camera_deco: 'digital_3c',
  screen_bezel: 'digital_3c',
  side_profile: 'digital_3c',
  hand_holding: 'digital_3c',
  apparel: 'apparel',
  clothing: 'apparel',
  full_body: 'apparel',
  upper_body: 'apparel',
  torso: 'apparel',
  outfit: 'apparel',
  bag: 'bag',
  handbag: 'bag',
  shoulder: 'bag',
  tote: 'bag',
  backpack: 'bag',
  crossbody: 'bag',
  shoes: 'shoes',
  feet: 'shoes',
  ankle: 'shoes',
  footwear: 'shoes',
  boots: 'shoes',
  sneakers: 'shoes',
  heels: 'shoes',
  beauty: 'beauty',
  lips: 'beauty',
  makeup: 'beauty',
  perfume: 'beauty',
  cosmetics: 'beauty',
  eyewear: 'eyewear',
  glasses: 'eyewear',
  sunglasses: 'eyewear',
  eyes: 'eyewear',
  all: 'universal',
  universal: 'universal',
};

function anatomyHintToCategory(hint: string): ActionCategoryId | null {
  const lower = hint.toLowerCase().trim();
  if (ANATOMY_TOKEN_CATEGORY[lower]) {
    return ANATOMY_TOKEN_CATEGORY[lower];
  }
  const info = inferProductCategoryAndAnatomy(hint);
  if (info.primaryCategory === 'all') return null;
  if (info.primaryCategory in ACTION_CATEGORY_BADGES) {
    return info.primaryCategory as ActionCategoryId;
  }
  return null;
}

function addCategoryFromTextKeywords(text: string, ids: Set<ActionCategoryId>): void {
  const lower = text.toLowerCase();
  // 1. 珠宝首饰类目：手镯、项链、耳饰、戒指、发簪、锁骨链、胸针等
  if (/jewelry|bracelet|necklace|earring|ring|hairpin|brooch|pendant|首饰|手镯|项链|耳饰|耳环|耳钉|戒指|指环|发簪|发髻|锁骨链|手链|饰品|腕表|手表|吊坠|珠串|玉镯|金镯|展戒|捻链|托坠|轻捏悬珠|悬珠|抚胸|锁骨|耳际|耳垂|手串|珠链|流苏|腕部|手饰|胸针|别针|领针/i.test(lower)) {
    ids.add('jewelry');
  }
  // 2. 手机数码类目：对镜自拍、横屏游戏、滑屏触控、镜头模组、全面屏等
  if (/digital|phone|smartphone|camera|screen|手机|数码|平板|耳机|手持手机|握持手机|对镜自拍|对镜拍|横屏游戏|横屏握持|滑屏触控|贴耳通话|镜头模组|全面屏|超窄黑边/i.test(lower)) {
    ids.add('digital_3c');
  }
  // 3. 服饰穿搭专属：仅限明确特指服装版型剪裁、大衣、西装翻领、时装搭配等专属服装属性（严格排除普通的“半身/全身机位”）
  if (/大衣版型|西装翻领|西服版型|风衣剪裁|面料肌理|裙摆飘动|毛呢大衣|羽绒服|羊绒衫|真丝衬衫|整套服装|私服穿搭|私服搭配|层次穿搭|服装搭配|服装剪裁|丝巾搭配|时装/i.test(lower)) {
    ids.add('apparel');
  }
  // 4. 箱包
  if (/bag|handbag|shoulder|tote|backpack|crossbody|包袋|手袋|托特包|单肩包|手提包|斜挎包|腋下包|背包/i.test(lower)) {
    ids.add('bag');
  }
  // 5. 鞋靴
  if (/shoes|feet|ankle|footwear|boots|sneakers|heels|鞋履|皮鞋|靴|马丁靴|切尔西|高跟鞋|脚踝特写|鞋带|鞋头/i.test(lower)) {
    ids.add('shoes');
  }
  // 6. 美妆
  if (/beauty|lips|makeup|perfume|cosmetics|美妆|口红|唇釉|唇膏|香水|手背试色|底妆|补妆/i.test(lower)) {
    ids.add('beauty');
  }
  // 7. 眼镜
  if (/eyewear|glasses|sunglasses|eyes|眼镜|墨镜|太阳镜|镜框|镜架|镜腿/i.test(lower)) {
    ids.add('eyewear');
  }
  // 8. 通用生活买家秀姿态
  if (/all|universal|通用|生活随拍|日常互动|生活空间|随性倚靠|漫步|走动|回眸|端坐|托腮|倚靠|捧杯|欢笑|抱书|插口袋|深色木台/i.test(lower)) {
    ids.add('universal');
  }
}

/**
 * 从动作的 suitableAnatomy、tags、title、action 中提取所有适用的品类徽章列表（支持一个动作适配多种类目）
 */
export function extractActionCategories(item: {
  suitableAnatomy?: string | null;
  tags?: string | null;
  title?: string | null;
  action?: string | null;
}): ActionCategoryBadge[] {
  const ids = new Set<ActionCategoryId>();

  const combined = `${item.suitableAnatomy || ''} ${item.tags || ''} ${item.title || ''} ${item.action || ''}`.trim();
  addCategoryFromTextKeywords(combined, ids);

  const anatomyRaw = String(item.suitableAnatomy || '');
  try {
    const parsed = JSON.parse(anatomyRaw);
    if (Array.isArray(parsed)) {
      for (const hint of parsed) {
        const cat = anatomyHintToCategory(String(hint));
        if (cat) ids.add(cat);
      }
    }
  } catch {
    const cat = anatomyHintToCategory(anatomyRaw);
    if (cat) ids.add(cat);
  }

  // 纠偏治理：如果历史数据误植入了 apparel 标签，但并没有明确服装版型或面料关键词，一律剔除 apparel
  const textCheck = `${item.title || ''} ${item.action || ''} ${item.tags || ''}`.toLowerCase();
  const hasExplicitApparel = /大衣版型|西装翻领|西服版型|风衣剪裁|面料肌理|裙摆飘动|毛呢大衣|羽绒服|羊绒衫|真丝衬衫|整套服装|私服穿搭|私服搭配|层次穿搭|服装搭配|服装剪裁|丝巾搭配|时装/.test(textCheck);
  if (ids.has('apparel') && !hasExplicitApparel) {
    ids.delete('apparel');
    if (ids.size === 0) {
      ids.add('universal');
    }
  }

  const primary = inferProductCategoryAndAnatomy(combined);
  if (primary.primaryCategory !== 'all' && primary.primaryCategory in ACTION_CATEGORY_BADGES) {
    // 同样避免 inferProductCategoryAndAnatomy 错误把通用衣服归为 apparel
    if (primary.primaryCategory !== 'apparel' || hasExplicitApparel) {
      ids.add(primary.primaryCategory as ActionCategoryId);
    }
  }

  if (ids.has('universal') && ids.size > 1) {
    ids.delete('universal');
  }

  if (ids.size === 0) {
    return [ACTION_CATEGORY_BADGES.universal];
  }

  return [...ids].map((id) => ACTION_CATEGORY_BADGES[id]);
}

/** 特写/微距机位下的精细聚焦部位锚点 */
export interface ActionFocusAnchor {
  id: string;
  label: string;
  shortLabel: string;
  category: ActionCategoryId;
  colorClass: string;
}

export const ACTION_FOCUS_ANCHORS: Record<string, ActionFocusAnchor> = {
  collarbone: {
    id: 'collarbone',
    label: '项链特写',
    shortLabel: '项链特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  fingers: {
    id: 'fingers',
    label: '戒指特写',
    shortLabel: '戒指特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  wrist: {
    id: 'wrist',
    label: '手镯特写',
    shortLabel: '手镯特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  ear: {
    id: 'ear',
    label: '耳饰特写',
    shortLabel: '耳饰特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  hair: {
    id: 'hair',
    label: '发簪特写',
    shortLabel: '发簪特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  brooch: {
    id: 'brooch',
    label: '胸针特写',
    shortLabel: '胸针特写',
    category: 'jewelry',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  camera_deco: {
    id: 'camera_deco',
    label: '镜头模组',
    shortLabel: '镜头模组',
    category: 'digital_3c',
    colorClass: 'bg-violet-50 text-violet-900 border-violet-300',
  },
  screen_bezel: {
    id: 'screen_bezel',
    label: '正面屏幕',
    shortLabel: '正面屏幕',
    category: 'digital_3c',
    colorClass: 'bg-violet-50 text-violet-900 border-violet-300',
  },
  side_profile: {
    id: 'side_profile',
    label: '金属中框',
    shortLabel: '金属中框',
    category: 'digital_3c',
    colorClass: 'bg-violet-50 text-violet-900 border-violet-300',
  },
  hand_holding: {
    id: 'hand_holding',
    label: '握持操作',
    shortLabel: '握持操作',
    category: 'digital_3c',
    colorClass: 'bg-violet-50 text-violet-900 border-violet-300',
  },
  // 通用日常解剖部位聚焦（用于通用特写/微距）
  hands: {
    id: 'hands',
    label: '手部特写',
    shortLabel: '手部特写',
    category: 'universal',
    colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  face: {
    id: 'face',
    label: '面部特写',
    shortLabel: '面部特写',
    category: 'universal',
    colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  neck: {
    id: 'neck',
    label: '颈肩特写',
    shortLabel: '颈肩特写',
    category: 'universal',
    colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  hair_head: {
    id: 'hair_head',
    label: '发髻特写',
    shortLabel: '发髻特写',
    category: 'universal',
    colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
};

/** 从动作数据中提取特写/微距的聚焦部位锚点列表 */
export function extractActionFocusAnchors(item: {
  suitableAnatomy?: string | null;
  tags?: string | null;
  title?: string | null;
  action?: string | null;
  shotType?: string | null;
}): ActionFocusAnchor[] {
  const shotTypeLower = String(item.shotType || '').toLowerCase();
  const titleLower = String(item.title || '').toLowerCase();
  const actionLower = String(item.action || '').toLowerCase();

  // 1. 若明确指定为半身姿态或全身氛围机位，且 suitableAnatomy 未显式指定局部特写部位，坚决不当成微距/特写！
  const isExplicitHalfOrFull =
    shotTypeLower === 'half_body' ||
    shotTypeLower === 'full_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction') ||
    shotTypeLower.includes('lifestyle_interaction') ||
    shotTypeLower.includes('full') ||
    shotTypeLower.includes('whole');

  let hasExplicitAnatomyHint = false;
  try {
    const raw = String(item.suitableAnatomy || '');
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.some((p) => p !== 'universal' && p !== 'all' && p !== 'general')) {
        hasExplicitAnatomyHint = true;
      }
    }
  } catch {}

  if (isExplicitHalfOrFull && !hasExplicitAnatomyHint) {
    return [];
  }

  const isCloseUpOrMacro =
    shotTypeLower.includes('close_up') ||
    shotTypeLower.includes('macro') ||
    titleLower.includes('特写') ||
    titleLower.includes('微距') ||
    (!isExplicitHalfOrFull && (titleLower.includes('近景') || actionLower.includes('近景'))) ||
    actionLower.includes('正中特写') ||
    actionLower.includes('细节特写') ||
    actionLower.includes('超清微距') ||
    actionLower.includes('局部微距');

  if (!isCloseUpOrMacro && !hasExplicitAnatomyHint) {
    // 全身或半身机位坚决不提取局部微距锚点！
    return [];
  }

  const matchedIds = new Set<string>();
  const text = `${item.title || ''} ${item.action || ''} ${item.tags || ''} ${item.suitableAnatomy || ''}`.toLowerCase();

  const hasExplicitJewelry = /项链|吊坠|锁骨链|颈饰|戒指|指环|戒圈|展戒|婚戒|对戒|钻戒|手镯|手链|手串|玉镯|金镯|腕部配饰|腕部饰品|手腕饰品|手饰|串珠|珠串|佩戴状态|展腕|侧腕|耳饰|耳环|耳钉|耳坠|发簪|发钗|步摇|簪花|胸针|别针|领针|jewelry|necklace|bracelet|ring|earring|hairpin|brooch|pendant/i.test(text);
  const hasExplicitDigital = /镜头模组|后摄|deco模组|全面屏|超窄黑边|超窄边框|金属中框|对镜自拍|对镜拍|横屏握持|横屏游戏|单手握持|贴耳通话/i.test(text);

  // 1. 从 suitableAnatomy JSON 解析
  try {
    const raw = String(item.suitableAnatomy || '');
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          const lower = String(p).toLowerCase();
          if (hasExplicitJewelry) {
            if (lower === 'necklace' || lower === 'collarbone') matchedIds.add('collarbone');
            if (lower === 'ring' || lower === 'fingers') matchedIds.add('fingers');
            if (lower === 'bracelet' || lower === 'wrist') matchedIds.add('wrist');
            if (lower === 'earring' || lower === 'ear') matchedIds.add('ear');
            if (lower === 'hairpin' || lower === 'hair') matchedIds.add('hair');
            if (lower === 'brooch') matchedIds.add('brooch');
          } else {
            // 无明确首饰词汇时，原历史标签安全映射为通用解剖部位
            if (lower === 'necklace' || lower === 'collarbone' || lower === 'neck') matchedIds.add('neck');
            if (lower === 'ring' || lower === 'fingers' || lower === 'bracelet' || lower === 'wrist' || lower === 'hands' || lower === 'hand') matchedIds.add('hands');
            if (lower === 'earring' || lower === 'ear' || lower === 'face' || lower === 'expression') matchedIds.add('face');
            if (lower === 'hairpin' || lower === 'hair' || lower === 'hair_head') matchedIds.add('hair_head');
            if (lower === 'brooch') matchedIds.add('brooch');
          }
          if (hasExplicitDigital) {
            if (lower === 'camera_deco' || lower === 'camera') matchedIds.add('camera_deco');
            if (lower === 'screen_bezel' || lower === 'screen') matchedIds.add('screen_bezel');
            if (lower === 'side_profile') matchedIds.add('side_profile');
            if (lower === 'hand_holding') matchedIds.add('hand_holding');
          }
          if (lower === 'hands' || lower === 'hand') matchedIds.add('hands');
          if (lower === 'face' || lower === 'expression') matchedIds.add('face');
          if (lower === 'neck' || lower === 'bust') matchedIds.add('neck');
          if (lower === 'hair_head') matchedIds.add('hair_head');
        }
      }
    }
  } catch {}

  // 2. 语义与关键词规则推断（严格边界词组，避免单字泛化）
  if (/项链|吊坠|锁骨链|领口锁骨|托坠|捻链/i.test(text)) {
    matchedIds.add('collarbone');
  }
  if (/戒指|指环|戒圈|展戒|婚戒|对戒|钻戒|指间戒|指部配饰/i.test(text)) {
    matchedIds.add('fingers');
  }
  if (/手镯|手链|手串|玉镯|金镯|腕部配饰|腕部饰品|手腕饰品|手饰|串珠|珠串|佩戴状态|展腕|侧腕|手腕微距|展露手链|手腕超清微距/i.test(text)) {
    matchedIds.add('wrist');
  }
  if (/耳饰|耳环|耳钉|耳坠|耳际饰品/i.test(text)) {
    matchedIds.add('ear');
  }
  if (/发簪|发钗|步摇|簪花/i.test(text)) {
    matchedIds.add('hair');
  }
  if (/胸针|别针|领针|brooch/i.test(text)) {
    matchedIds.add('brooch');
  }
  if (/镜头模组|后摄|deco模组|镜头圈|镀膜/i.test(text)) {
    matchedIds.add('camera_deco');
  }
  if (/全面屏|超窄黑边|超窄边框|息屏美学|屏幕微距/i.test(text)) {
    matchedIds.add('screen_bezel');
  }
  if (/金属中框|纤薄中框|纤薄侧边|按键切角/i.test(text)) {
    matchedIds.add('side_profile');
  }
  if (/对镜自拍|对镜拍|横屏握持|横屏游戏|单手握持|贴耳通话/i.test(text)) {
    matchedIds.add('hand_holding');
  }

  // 3. 通用解剖部位推断 (为通用日常特写提供精细解剖下钻)
  const hasJewelryAnchor = matchedIds.has('collarbone') || matchedIds.has('fingers') || matchedIds.has('wrist') || matchedIds.has('ear') || matchedIds.has('hair') || matchedIds.has('brooch');
  const hasDigitalAnchor = matchedIds.has('camera_deco') || matchedIds.has('screen_bezel') || matchedIds.has('side_profile') || matchedIds.has('hand_holding');

  if (/覆手|手背|五指|手掌|掌心|垂腕|抚手|双手交叠|双臂交叠|交叠轻抚|握持|持杯|扶杯|触杯|翻书|翻阅|纸质书页|轻捻|递杯|伸手|手腕斜展|手腕微仰|立腕|横臂抱胸|展手/i.test(text)) {
    if (!hasJewelryAnchor && !hasDigitalAnchor) {
      matchedIds.add('hands');
    }
  }
  if (/贴脸|面部|欢笑|遮眼|托腮|抚腮|含花|夹花|大笑|微笑|眨眼|神态|眼神|下颌|面颊|唇含|嘴角|凝视|凝眸|侧颜|娇萌|眨眼wink|抚面/i.test(text)) {
    if (!hasJewelryAnchor && !hasDigitalAnchor) {
      matchedIds.add('face');
    }
  }
  if (/双肩|平展双肩|双肩平展|双肩水平|双肩舒展|肩颈|胸像|端坐|抚颈|颈侧|颈项|胸前搭手|锁骨平视|正面居中特写/i.test(text)) {
    if (!hasJewelryAnchor && !hasDigitalAnchor) {
      matchedIds.add('neck');
    }
  }
  if (/拢发|秀发|发丝|发际|耳畔/i.test(text)) {
    if (!hasJewelryAnchor && !hasDigitalAnchor) {
      matchedIds.add('hair_head');
    }
  }

  // 兜底守卫：若既无明确首饰词汇也无明确数码词汇，坚决移除误渗入的首饰锚点
  if (!hasExplicitJewelry) {
    if (matchedIds.has('fingers') || matchedIds.has('wrist')) {
      matchedIds.delete('fingers');
      matchedIds.delete('wrist');
      matchedIds.add('hands');
    }
    if (matchedIds.has('collarbone')) {
      matchedIds.delete('collarbone');
      matchedIds.add('neck');
    }
    if (matchedIds.has('ear')) {
      matchedIds.delete('ear');
      matchedIds.add('face');
    }
    if (matchedIds.has('hair')) {
      matchedIds.delete('hair');
      matchedIds.add('hair_head');
    }
  }

  return [...matchedIds].map((id) => ACTION_FOCUS_ANCHORS[id]).filter(Boolean);
}

/**
 * 智能匹配动作数据所属的二级细分类目
 */
export function matchItemSubCategory(
  item: {
    title?: string | null;
    action?: string | null;
    tags?: string | null;
    suitableAnatomy?: string | null;
    shotType?: string | null;
  },
  categoryId: ActionCategoryId = 'jewelry',
  customSubCategories?: SubCategoryDef[]
): SubCategoryDef | null {
  const subCategories = customSubCategories || getSubCategoriesForCategory(categoryId);
  if (!subCategories || subCategories.length === 0) return null;

  // 1. 优先通过锚点匹配
  const anchors = extractActionFocusAnchors(item);
  for (const anchor of anchors) {
    const matched = subCategories.find((s) => s.anchorId === anchor.id || s.id === anchor.id);
    if (matched) return matched;
  }

  // 2. 通过文本与关键词匹配
  const text = `${item.title || ''} ${item.action || ''} ${item.tags || ''} ${item.suitableAnatomy || ''}`.toLowerCase();
  for (const sub of subCategories) {
    if (
      sub.keywords.some((k) => text.includes(k.toLowerCase())) ||
      text.includes(sub.label.toLowerCase()) ||
      text.includes(sub.shortLabel.toLowerCase())
    ) {
      return sub;
    }
  }
  return null;
}

/** 兼容旧版 matchJewelrySubCategory 签名 */
export function matchJewelrySubCategory(item: {
  title?: string | null;
  action?: string | null;
  tags?: string | null;
  suitableAnatomy?: string | null;
  shotType?: string | null;
}): SubCategoryDef | null {
  return matchItemSubCategory(item, 'jewelry');
}

export interface ActionDisplayBadge {
  id: string;
  label: string;
  colorClass: string;
  isAnchor?: boolean;
}

/** 
 * 解析动作卡片在 UI 顶部呈现的徽标组合
 * 统一标准：所有卡片严格恒定输出两级双徽标
 * 徽标 1: [一级品类] (首饰 / 通用 / 手机数码 / 服饰)
 * 徽标 2: [二级细分部位/姿态] (手镯特写 / 项链特写 / 戒指特写 / 手部特写 / 半身姿态 / 全身氛围)
 */
export function resolveActionCardDisplayBadges(item: {
  suitableAnatomy?: string | null;
  tags?: string | null;
  title?: string | null;
  action?: string | null;
  shotType?: string | null;
}): ActionDisplayBadge[] {
  const anchors = extractActionFocusAnchors(item);
  const cats = extractActionCategories(item);
  const primaryCat = cats[0] || ACTION_CATEGORY_BADGES.universal;

  // 0. 优先检测是否有用户手动指定的标签覆盖 (来自 tags 字段)
  const tagsStr = String(item.tags || '');
  const manualPostureMap: Record<string, { label: string; colorClass: string }> = {
    '半身姿态': { label: '半身姿态', colorClass: 'bg-slate-50 text-slate-600 border-slate-200/80' },
    '全身氛围': { label: '全身氛围', colorClass: 'bg-slate-50 text-slate-600 border-slate-200/80' },
    '细节特写': { label: '细节特写', colorClass: 'bg-slate-50 text-slate-600 border-slate-200/80' },
    '面部特写': { label: '面部特写', colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
    '手部特写': { label: '手部特写', colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
    '项链特写': { label: '项链特写', colorClass: 'bg-amber-50 text-amber-900 border-amber-300' },
    '手镯特写': { label: '手镯特写', colorClass: 'bg-amber-50 text-amber-900 border-amber-300' },
    '戒指特写': { label: '戒指特写', colorClass: 'bg-amber-50 text-amber-900 border-amber-300' },
    '耳饰特写': { label: '耳饰特写', colorClass: 'bg-amber-50 text-amber-900 border-amber-300' },
  };

  for (const [key, cfg] of Object.entries(manualPostureMap)) {
    if (tagsStr.includes(key)) {
      return [
        {
          id: primaryCat.id,
          label: primaryCat.label,
          colorClass: primaryCat.colorClass,
          isAnchor: false,
        },
        {
          id: `manual-${key}`,
          label: cfg.label,
          colorClass: cfg.colorClass,
          isAnchor: key.includes('特写'),
        },
      ];
    }
  }

  // 1. 如果匹配到了特写部位锚点，统一返回：[一级品类] + [二级特写细分]
  if (anchors.length > 0) {
    const specificAnchor = anchors.find((a) => a.category !== 'universal') || anchors[0];
    return [
      {
        id: primaryCat.id,
        label: primaryCat.label,
        colorClass: primaryCat.colorClass,
        isAnchor: false,
      },
      {
        id: specificAnchor.id,
        label: specificAnchor.label,
        colorClass: specificAnchor.colorClass,
        isAnchor: true,
      },
    ];
  }

  // 2. 如果能够匹配到该一级品类下的二级类目（如：项链/锁骨链、手镯/手串、镜头模组等），展示精准二级徽标
  if (primaryCat.id !== 'universal') {
    const subCategory = matchItemSubCategory(item, primaryCat.id as ActionCategoryId);
    if (subCategory) {
      return [
        {
          id: primaryCat.id,
          label: primaryCat.label,
          colorClass: primaryCat.colorClass,
          isAnchor: false,
        },
        {
          id: subCategory.id,
          label: subCategory.label,
          colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
          isAnchor: true,
        },
      ];
    }
  }

  // 3. 非特写或半身/全身动作，统一返回：[一级品类] + [景别与体态]
  const shotTypeLower = String(item.shotType || '').toLowerCase();
  const titleLower = String(item.title || '').toLowerCase();
  const actionLower = String(item.action || '').toLowerCase();

  let postureLabel = '半身姿态';
  if (
    shotTypeLower === 'half_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction')
  ) {
    postureLabel = '半身姿态';
  } else if (
    shotTypeLower === 'full_body' ||
    shotTypeLower.includes('full') ||
    shotTypeLower.includes('whole') ||
    titleLower.includes('全身') ||
    actionLower.includes('全身') ||
    actionLower.includes('迈步') ||
    actionLower.includes('站立')
  ) {
    postureLabel = '全身氛围';
  } else if (
    shotTypeLower.includes('close') ||
    shotTypeLower.includes('macro') ||
    titleLower.includes('特写') ||
    titleLower.includes('微距')
  ) {
    postureLabel = '局部特写';
  }

  return [
    {
      id: primaryCat.id,
      label: primaryCat.label,
      colorClass: primaryCat.colorClass,
      isAnchor: false,
    },
    {
      id: `scale-${postureLabel}`,
      label: postureLabel,
      colorClass: 'bg-slate-50 text-slate-600 border-slate-200/80',
      isAnchor: false,
    },
  ];
}
