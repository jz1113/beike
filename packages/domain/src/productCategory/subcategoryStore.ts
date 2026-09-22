import {
  ActionCategoryId,
  SubCategoryDef,
  DEFAULT_SUBCATEGORIES_MAP,
  SUBCATEGORY_STORAGE_KEY_PREFIX,
} from './defs';
import { domainStorage } from '../runtime';
import { getHydratedSubCategories } from './serverCache';

/**
 * 获取指定一级品类的二级类目表。服务端 hydration 优先，本地存储仅作缓存。
 */
export function getSubCategoriesForCategory(categoryId: ActionCategoryId): SubCategoryDef[] {
  const hydrated = getHydratedSubCategories(categoryId);
  if (hydrated && hydrated.length > 0) return hydrated;
  const storage = domainStorage();
  if (storage) {
    try {
      const stored = storage.getItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_SUBCATEGORIES_MAP[categoryId] || [];
}

/**
 * 保存指定一级品类的二级类目表到本地存储
 */
export function saveSubCategoriesForCategory(categoryId: ActionCategoryId, list: SubCategoryDef[]): void {
  const storage = domainStorage();
  if (storage) {
    try {
      storage.setItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent('antigravity_subcategory_changed', {
          detail: { categoryId, list },
        })
      );
    } catch {
      // ignore
    }
  }
}

/**
 * 重置指定一级品类的二级类目表为默认黄金预设
 */
export function resetSubCategoriesForCategory(categoryId: ActionCategoryId): SubCategoryDef[] {
  const defaults = DEFAULT_SUBCATEGORIES_MAP[categoryId] || [];
  const storage = domainStorage();
  if (storage) {
    try {
      storage.removeItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`);
      window.dispatchEvent(
        new CustomEvent('antigravity_subcategory_changed', {
          detail: { categoryId, list: defaults },
        })
      );
    } catch {
      // ignore
    }
  }
  return defaults;
}

/**
 * 批量导入二级类目：支持按行或以逗号/分号/冒号分隔的文本输入
 */
export function importSubCategoriesFromText(
  categoryId: ActionCategoryId,
  rawText: string,
  mode: 'append' | 'replace' = 'append'
): SubCategoryDef[] {
  const lines = rawText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const newItems: SubCategoryDef[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let label = '';
    let keywordPart = '';

    if (line.includes(':') || line.includes('：')) {
      const parts = line.split(/[:：]/);
      label = (parts[0] || '').trim();
      keywordPart = parts.slice(1).join(' ');
    } else if (line.includes('(') && line.includes(')')) {
      const match = line.match(/^([^()]+)\(([^()]+)\)/);
      if (match) {
        label = match[1].trim();
        keywordPart = match[2].trim();
      }
    } else if (line.includes('（') && line.includes('）')) {
      const match = line.match(/^([^（）]+)（([^（）]+)）/);
      if (match) {
        label = match[1].trim();
        keywordPart = match[2].trim();
      }
    } else {
      const parts = line.split(/[,，、/| \t]+/);
      label = (parts[0] || '').trim();
      keywordPart = parts.slice(1).join(' ');
    }

    if (!label) continue;

    const shortLabel = label.split(/[/、|\\]/)[0].trim().slice(0, 4) || label.slice(0, 4);
    const idSafe = `sub_${Date.now().toString(36)}_${i}`;

    const rawKeywords = [
      label,
      shortLabel,
      ...keywordPart.split(/[,，、/| \t;；]+/).map((k) => k.trim()),
    ].filter(Boolean);
    const uniqueKeywords = Array.from(new Set(rawKeywords));

    let anatomy = 'general';
    let anchorId = 'collarbone';
    const kwStr = uniqueKeywords.join(' ').toLowerCase();

    if (kwStr.includes('手镯') || kwStr.includes('手链') || kwStr.includes('手串') || kwStr.includes('腕') || kwStr.includes('袖')) {
      anatomy = 'wrist';
      anchorId = 'wrist';
    } else if (kwStr.includes('戒') || kwStr.includes('指') || kwStr.includes('手掌')) {
      anatomy = 'fingers';
      anchorId = 'fingers';
    } else if (kwStr.includes('耳') || kwStr.includes('听')) {
      anatomy = 'ear';
      anchorId = 'ear';
    } else if (kwStr.includes('发') || kwStr.includes('簪') || kwStr.includes('头') || kwStr.includes('髻')) {
      anatomy = 'hair';
      anchorId = 'hair';
    } else if (kwStr.includes('胸') || kwStr.includes('别针') || kwStr.includes('领针')) {
      anatomy = 'brooch';
      anchorId = 'brooch';
    } else if (kwStr.includes('脚') || kwStr.includes('踝')) {
      anatomy = 'ankle';
      anchorId = 'legs';
    } else if (kwStr.includes('项') || kwStr.includes('锁骨') || kwStr.includes('颈') || kwStr.includes('坠')) {
      anatomy = 'necklace';
      anchorId = 'collarbone';
    }

    newItems.push({
      id: idSafe,
      parentId: categoryId,
      label,
      shortLabel,
      anatomy,
      anchorId,
      keywords: uniqueKeywords,
      isCustom: true,
    });
  }

  const existing = mode === 'replace' ? [] : getSubCategoriesForCategory(categoryId);
  const resultMap = new Map<string, SubCategoryDef>();
  for (const it of existing) {
    resultMap.set(it.label, it);
  }
  for (const it of newItems) {
    resultMap.set(it.label, it);
  }

  const merged = Array.from(resultMap.values());
  saveSubCategoriesForCategory(categoryId, merged);
  return merged;
}

export interface SubCategoryConsolidationGroup {
  clusterId: string;
  category: SubCategoryDef;
  absorbedLabels: string[];
  originalCount: number;
}

export interface SubCategoryConsolidationResult {
  categoryId: ActionCategoryId;
  originalCount: number;
  consolidatedCount: number;
  groups: SubCategoryConsolidationGroup[];
  consolidatedCategories: SubCategoryDef[];
}

const JEWELRY_CLUSTERS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  anchorId: string;
  anatomy: string;
  pattern: RegExp;
  baseKeywords: string[];
}> = [
  {
    id: 'wrist_ornament',
    label: '手镯/手链/手串',
    shortLabel: '手镯',
    anchorId: 'wrist',
    anatomy: 'wrist',
    pattern: /手镯|手链|手串|手环|手绳|转运珠|手饰|叮当镯|佛珠|串珠|金手镯|银手镯|银手链|翡翠手镯|和田玉手镯|和田玉手链|珍珠手链|k金手镯|铂金手镯|黄金手链|黄金手镯|宝宝金饰|宝宝银饰|宝玉金饰|小叶紫檀|沉香|菩提|橄榄核/i,
    baseKeywords: ['手镯', '手链', '手串', '手环', '手绳', '转运珠', '串珠', '叮当镯', '佛珠', '手腕', '展腕'],
  },
  {
    id: 'neck_ornament',
    label: '项链/吊坠/锁骨链',
    shortLabel: '项链',
    anchorId: 'collarbone',
    anatomy: 'necklace',
    pattern: /项链|吊坠|锁骨链|颈链|套链|毛衣链|choker|项坠|素链|黄金项链|黄金吊坠|黄金套链|黄金素链|翡翠吊坠|翡翠项链|和田玉吊坠|珍珠项链|珍珠吊坠|k金项链|k金吊坠|铂金项链|银吊坠/i,
    baseKeywords: ['项链', '吊坠', '锁骨链', '颈链', '套链', '毛衣链', 'choker', '项坠', '领口', '锁骨'],
  },
  {
    id: 'finger_ornament',
    label: '戒指/指环',
    shortLabel: '戒指',
    anchorId: 'fingers',
    anatomy: 'fingers',
    pattern: /戒指|指环|钻戒|对戒|尾戒|戒圈|素圈|排戒|钻石|黄金戒指|银戒指|翡翠戒指|k金戒指|培育钻石/i,
    baseKeywords: ['戒指', '指环', '钻戒', '对戒', '尾戒', '戒圈', '指间', '手部特写'],
  },
  {
    id: 'ear_ornament',
    label: '耳饰/耳环/耳钉',
    shortLabel: '耳饰',
    anchorId: 'ear',
    anatomy: 'ear',
    pattern: /耳饰|耳环|耳钉|耳坠|耳夹|耳线|流苏耳环|黄金耳饰|银耳饰|珍珠耳饰|k金耳饰|翡翠耳饰/i,
    baseKeywords: ['耳饰', '耳环', '耳钉', '耳坠', '耳夹', '耳线', '侧颜', '耳畔'],
  },
  {
    id: 'hair_ornament',
    label: '发饰/头饰/发夹',
    shortLabel: '发饰',
    anchorId: 'hair',
    anatomy: 'hair',
    pattern: /发饰|发夹|发圈|发箍|发簪|发冠|步摇|抓夹|发绳|盘发|头饰|其他发饰/i,
    baseKeywords: ['发饰', '发夹', '发圈', '发箍', '发簪', '发冠', '步摇', '抓夹', '头饰', '秀发'],
  },
  {
    id: 'brooch_ornament',
    label: '胸针/配饰',
    shortLabel: '胸针',
    anchorId: 'brooch',
    anatomy: 'brooch',
    pattern: /胸针|别针|领针|领花|徽章/i,
    baseKeywords: ['胸针', '别针', '领针', '领花', '胸前配饰'],
  },
  {
    id: 'ankle_ornament',
    label: '脚链/脚镯',
    shortLabel: '脚链',
    anchorId: 'legs',
    anatomy: 'ankle',
    pattern: /脚链|脚镯|足链|踝饰/i,
    baseKeywords: ['脚链', '脚镯', '踝链', '脚踝特写'],
  },
  {
    id: 'watch_ornament',
    label: '腕表/手表',
    shortLabel: '手表',
    anchorId: 'wrist',
    anatomy: 'wrist',
    pattern: /腕表|手表|机械表|石英表|表盘|表带/i,
    baseKeywords: ['腕表', '手表', '机械表', '石英表', '表盘'],
  },
  {
    id: 'curio_and_static',
    label: '静物文玩/摆件/其他',
    shortLabel: '文玩',
    anchorId: 'collarbone',
    anatomy: 'general',
    pattern: /投资收藏|翡翠原石|投资金|投资银|首饰盒|特殊商品|饰品配件|饰品套装|智能饰品|绿松石|琥珀|其他文玩饰品/i,
    baseKeywords: ['原石', '文玩', '摆件', '静物', '饰品盒', '投资收藏'],
  },
];

const DIGITAL_3C_CLUSTERS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  anchorId: string;
  anatomy: string;
  pattern: RegExp;
  baseKeywords: string[];
}> = [
  {
    id: 'smartphone',
    label: '智能手机/折叠屏',
    shortLabel: '手机',
    anchorId: 'camera_deco',
    anatomy: 'hand',
    pattern: /手机|折叠屏|旗舰机|背板|屏幕|摄像头模组|deco模组/i,
    baseKeywords: ['手机', '折叠屏', '屏幕特写', '镜头模组', '单手握持', '对镜自拍'],
  },
  {
    id: 'earphones',
    label: '无线耳机/头戴式',
    shortLabel: '耳机',
    anchorId: 'side_profile',
    anatomy: 'ears',
    pattern: /耳机|头戴|入耳|挂耳|降噪|充电仓|耳塞/i,
    baseKeywords: ['无线耳机', '头戴式耳机', '入耳式', '充电仓', '侧颜佩戴'],
  },
  {
    id: 'smartwatch',
    label: '智能手表/手环',
    shortLabel: '手表',
    anchorId: 'wrist',
    anatomy: 'wrist',
    pattern: /手表|手环|穿戴|表盘|表带/i,
    baseKeywords: ['智能手表', '运动手环', '表盘特写', '腕间佩戴'],
  },
  {
    id: 'tablet_laptop',
    label: '平板电脑/笔电',
    shortLabel: '平板',
    anchorId: 'screen_bezel',
    anatomy: 'hand',
    pattern: /平板|电脑|手写笔|保护套|支架|笔记本/i,
    baseKeywords: ['平板电脑', '手写笔', '大屏特写', '双手操作'],
  },
  {
    id: 'digital_accessories',
    label: '数码外设/生活周边',
    shortLabel: '外设',
    anchorId: 'hand_holding',
    anatomy: 'hand',
    pattern: /游戏|手柄|掌机|摇杆|键盘|鼠标|音箱|充电宝|数据线|自拍杆|云台/i,
    baseKeywords: ['游戏手柄', '掌机', '数码外设', '桌面氛围'],
  },
];

const APPAREL_CLUSTERS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  anchorId: string;
  anatomy: string;
  pattern: RegExp;
  baseKeywords: string[];
}> = [
  {
    id: 'apparel_top',
    label: '上装/内搭/外套',
    shortLabel: '上装',
    anchorId: 'upper_body',
    anatomy: 'upper_body',
    pattern: /t恤|衬衫|针织衫|卫衣|外套|西装|大衣|风衣|夹克|吊带|马甲|羽绒服|上衣/i,
    baseKeywords: ['衬衫', '针织衫', '外套', '西装', '大衣', '上身姿态'],
  },
  {
    id: 'apparel_bottom',
    label: '下装/裤装/裙装',
    shortLabel: '下装',
    anchorId: 'legs',
    anatomy: 'legs',
    pattern: /裤|牛仔裤|休闲裤|西裤|半身裙|短裙|长裙|短裤|阔腿裤|拖地裤|连衣裙/i,
    baseKeywords: ['阔腿裤', '牛仔裤', '半身裙', '下身线条', '迈步'],
  },
  {
    id: 'apparel_shoes',
    label: '鞋履/鞋靴',
    shortLabel: '鞋靴',
    anchorId: 'feet',
    anatomy: 'feet',
    pattern: /鞋|靴|高跟鞋|马丁靴|运动鞋|球鞋|凉鞋|短靴|长靴|板鞋/i,
    baseKeywords: ['高跟鞋', '运动鞋', '靴子', '足部特写', '迈步'],
  },
  {
    id: 'apparel_bags',
    label: '箱包/手袋',
    shortLabel: '箱包',
    anchorId: 'hands',
    anatomy: 'hands',
    pattern: /包|手袋|托特包|单肩包|斜挎包|双肩包|手提包/i,
    baseKeywords: ['单肩包', '斜挎包', '托特包', '手拎包', '背包'],
  },
  {
    id: 'apparel_details',
    label: '领口/袖口/版型剪裁',
    shortLabel: '剪裁',
    anchorId: 'collarbone',
    anatomy: 'waist',
    pattern: /领口|袖口|腰线|收腰|下摆|裙摆|剪裁|版型|细节/i,
    baseKeywords: ['领口设计', '袖口细节', '收腰剪裁', '细节特写'],
  },
];

export function consolidateSubCategoriesLocally(
  categoryId: ActionCategoryId,
  rawList: SubCategoryDef[]
): SubCategoryConsolidationResult {
  if (!rawList || rawList.length === 0) {
    return {
      categoryId,
      originalCount: 0,
      consolidatedCount: 0,
      groups: [],
      consolidatedCategories: [],
    };
  }

  const clusterDefs =
    categoryId === 'jewelry'
      ? JEWELRY_CLUSTERS
      : categoryId === 'digital_3c'
      ? DIGITAL_3C_CLUSTERS
      : categoryId === 'apparel'
      ? APPAREL_CLUSTERS
      : [];

  const groupsMap = new Map<
    string,
    {
      clusterId: string;
      label: string;
      shortLabel: string;
      anchorId: string;
      anatomy: string;
      keywordsSet: Set<string>;
      absorbedLabels: string[];
    }
  >();

  const getOrCreateGroup = (
    cId: string,
    label: string,
    shortLabel: string,
    anchorId: string,
    anatomy: string,
    baseKw: string[]
  ) => {
    if (!groupsMap.has(cId)) {
      groupsMap.set(cId, {
        clusterId: cId,
        label,
        shortLabel,
        anchorId,
        anatomy,
        keywordsSet: new Set(baseKw),
        absorbedLabels: [],
      });
    }
    return groupsMap.get(cId)!;
  };

  const unclusteredItems: SubCategoryDef[] = [];

  for (const item of rawList) {
    const textToMatch = `${item.label} ${item.shortLabel || ''} ${item.keywords.join(' ')}`.toLowerCase();
    const matchedCluster = clusterDefs.find((c) => c.pattern.test(textToMatch));

    if (matchedCluster) {
      const g = getOrCreateGroup(
        matchedCluster.id,
        matchedCluster.label,
        matchedCluster.shortLabel,
        matchedCluster.anchorId,
        matchedCluster.anatomy,
        matchedCluster.baseKeywords
      );
      g.absorbedLabels.push(item.label);
      g.keywordsSet.add(item.label);
      if (item.shortLabel) g.keywordsSet.add(item.shortLabel);
      for (const kw of item.keywords) {
        if (kw && kw.trim()) g.keywordsSet.add(kw.trim());
      }
    } else {
      unclusteredItems.push(item);
    }
  }

  const unclusteredUnique = new Map<string, SubCategoryDef>();
  for (const u of unclusteredItems) {
    const existing = unclusteredUnique.get(u.label);
    if (!existing) {
      unclusteredUnique.set(u.label, { ...u, keywords: [...u.keywords] });
    } else {
      const combined = new Set([...existing.keywords, ...u.keywords]);
      existing.keywords = Array.from(combined);
    }
  }

  const finalGroups: SubCategoryConsolidationGroup[] = [];
  const consolidatedCategories: SubCategoryDef[] = [];

  for (const [cId, g] of groupsMap.entries()) {
    const uniqueKw = Array.from(g.keywordsSet).filter(Boolean);
    const catDef: SubCategoryDef = {
      id: `consolidated_${categoryId}_${cId}`,
      parentId: categoryId,
      label: g.label,
      shortLabel: g.shortLabel,
      anchorId: g.anchorId,
      anatomy: g.anatomy,
      keywords: uniqueKw,
      isCustom: true,
    };
    consolidatedCategories.push(catDef);
    finalGroups.push({
      clusterId: cId,
      category: catDef,
      absorbedLabels: Array.from(new Set(g.absorbedLabels)),
      originalCount: g.absorbedLabels.length,
    });
  }

  for (const u of unclusteredUnique.values()) {
    consolidatedCategories.push(u);
    finalGroups.push({
      clusterId: u.id,
      category: u,
      absorbedLabels: [u.label],
      originalCount: 1,
    });
  }

  return {
    categoryId,
    originalCount: rawList.length,
    consolidatedCount: consolidatedCategories.length,
    groups: finalGroups,
    consolidatedCategories,
  };
}
