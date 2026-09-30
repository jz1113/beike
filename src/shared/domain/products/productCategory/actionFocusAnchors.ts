import type { ActionCategoryId } from './defs';

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

