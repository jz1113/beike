import type { ActionCategoryId } from './defs';
import { inferProductCategoryAndAnatomy } from './infer';

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

