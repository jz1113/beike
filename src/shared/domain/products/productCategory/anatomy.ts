/** 动作二级类目匹配与卡片徽章展示规则 */
import type { ActionCategoryId, SubCategoryDef } from './defs';
import { getSubCategoriesForCategory } from './subcategoryStore';
import { ACTION_CATEGORY_BADGES, extractActionCategories } from './actionCategories';
import { extractActionFocusAnchors } from './actionFocusAnchors';

export { ACTION_CATEGORY_BADGES, ANATOMY_TOKEN_CATEGORY, extractActionCategories, type ActionCategoryBadge } from './actionCategories';
export { ACTION_FOCUS_ANCHORS, extractActionFocusAnchors, type ActionFocusAnchor } from './actionFocusAnchors';

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
