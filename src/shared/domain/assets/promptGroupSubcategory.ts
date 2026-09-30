import type { AssetProductCategory } from './assetOrganization';

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

export function isPromptGroupSubcategoryFolderId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX);
}

export function builtinSubcategoryFolderId(value: PromptGroupSubcategory): string {
  return `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}digital_3c:${value}`;
}

export function isValidPromptGroupSubcategoryValue(value: unknown): value is string {
  return isPromptGroupSubcategory(value) || isPromptGroupSubcategoryFolderId(value);
}

/** Shared by library browsing and production; current folder names override built-in labels. */
export function promptGroupSubcategoryOptions(categories: AssetProductCategory[], parentId: string) {
  const custom = categories.filter(category => category.parentId === parentId && isPromptGroupSubcategoryFolderId(category.id));
  const builtins = parentId === 'digital_3c'
    ? PROMPT_GROUP_SUBCATEGORIES.filter(id => !custom.find(category => category.id === builtinSubcategoryFolderId(id))?.isArchived)
      .map(id => ({ id, label: custom.find(category => category.id === builtinSubcategoryFolderId(id))?.name || PROMPT_GROUP_SUBCATEGORY_LABELS[id], folderId: builtinSubcategoryFolderId(id) }))
    : [];
  return [...builtins, ...custom.filter(category => !category.isArchived && !builtins.some(option => option.folderId === category.id))
    .map(category => ({ id: category.id, label: category.name, folderId: category.id }))];
}

export function recognizedPromptGroupSubcategory(value: unknown, categories: AssetProductCategory[], parentId: string): string | null {
  if (parentId === 'digital_3c' && isPromptGroupSubcategory(value)) {
    return categories.find(category => category.id === builtinSubcategoryFolderId(value))?.isArchived ? null : value;
  }
  if (!isPromptGroupSubcategoryFolderId(value)) return null;
  if (!categories.some(category => category.id === value && category.parentId === parentId && !category.isArchived)) return null;
  if (parentId === 'digital_3c') {
    const builtin = PROMPT_GROUP_SUBCATEGORIES.find(id => builtinSubcategoryFolderId(id) === value);
    if (builtin) return builtin;
  }
  return value;
}
