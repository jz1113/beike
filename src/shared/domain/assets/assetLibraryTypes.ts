export const PROMPT_ASSET_TYPES = [
  'scene',
  'outfit',
  'action',
  'persona',
  'full_prompt',
] as const;
export type PromptAssetType = (typeof PROMPT_ASSET_TYPES)[number];

/** 资产库列表项（slim API 与前端缓存） */
export interface AssetLibrarySlim extends Record<string, unknown> {
  registry?: { status?: string; [key: string]: unknown } | null;
  lifecycleStatus?: string;
  id: string;
  /** Stable, library-wide number for a full prompt group (independent of sorting/filtering). */
  displayNumber?: number | null;
  listPosition?: number;
  avatarUrl?: string | null;
  sourceImageIndex?: number | null;
  sourceImageIndices?: string | null;
  imageType?: string | null;
  title?: string | null;
  name?: string | null;
  tags?: string | null;
  category?: string | null;
  productSubcategory?: string | null;
  isFavorite?: boolean;
  usageCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  code?: string;
  coverUrl?: string | null;
  suitableAnatomy?: string | null;
  shotType?: string | null;
  albumName?: string | null;
  action?: string | null;
  camera?: string | null;
  description?: string | null;
  sceneSummary?: string | null;
  outfitSummary?: string | null;
  actionSummary?: string | null;
  personaSummary?: string | null;
  replaceableSlots?: string | null;
  shotCount?: number;
  spatialType?: string | null;
  lighting?: string | null;
  top?: string | null;
  bottom?: string | null;
  shoes?: string | null;
  colorPalette?: string | null;
  architectureSummary?: string | null;
  contentSummary?: string | null;
  reversePrompt?: string | null;
  reversePromptZh?: string | null;
}

/** 资产库详情（含长文本与 sourceImages） */
export interface AssetLibraryItem extends AssetLibrarySlim {
  reversePrompt?: string | null;
  reversePromptZh?: string | null;
  reversePromptEn?: string | null;
  sourceImages?: string | null;
  dimensions?: string | null;
  [key: string]: unknown;
}

export interface AssetProductCategory {
  id: string; name: string; parentId: string | null; position: number; isArchived?: boolean;
  keywords?: string; anatomy?: string; aliases?: string;
  isReadOnly?: boolean;
}
export function categoryIds(raw: unknown): string[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id))] : [];
  } catch { return []; }
}

/** The sellable subject of a digital four-image mother group, not its visual style. */
export const PROMPT_GROUP_SUBCATEGORIES = ['phone', 'case', 'earphone', 'tablet'] as const;

export type PromptGroupSubcategory = typeof PROMPT_GROUP_SUBCATEGORIES[number];

export const PROMPT_GROUP_SUBCATEGORY_LABELS: Record<PromptGroupSubcategory, string> = {
  phone: '手机本体',
  case: '手机壳',
  earphone: '耳机',
  tablet: '平板',
};

export function isPromptGroupSubcategory(value: unknown): value is PromptGroupSubcategory {
  return typeof value === 'string' && PROMPT_GROUP_SUBCATEGORIES.some(category => category === value);
}

/** Distinguishes mother-group folders from the existing visual/anatomy child categories. */
export const PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX = 'prompt_subcategory:';

export function builtinSubcategoryFolderId(value: PromptGroupSubcategory): string {
  return `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}digital_3c:${value}`;
}
