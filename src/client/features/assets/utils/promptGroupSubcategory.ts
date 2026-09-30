import {
  PROMPT_GROUP_SUBCATEGORIES,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  promptGroupSubcategoryOptions,
  recognizedPromptGroupSubcategory,
} from '@shared/domain/assets/promptGroupSubcategory';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';

export const PROMPT_GROUP_SUBCATEGORY_OPTIONS = PROMPT_GROUP_SUBCATEGORIES.map((id) => ({
  id,
  label: PROMPT_GROUP_SUBCATEGORY_LABELS[id],
}));

export type PromptGroupSubcategoryFilter = string;

export { promptGroupSubcategoryOptions, recognizedPromptGroupSubcategory };

export function promptGroupSubcategoryLabel(value: unknown, categories: AssetProductCategory[] = [], parentId = 'digital_3c'): string {
  const recognized = recognizedPromptGroupSubcategory(value, categories, parentId);
  return promptGroupSubcategoryOptions(categories, parentId).find(option => option.id === recognized)?.label || '待分类';
}
