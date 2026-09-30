import {
  getSubCategoriesForCategory,
  inferProductCategoryAndAnatomy,
  type ActionCategoryId,
} from '@shared/domain/products/productCategory';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import type { ImageSetQueueItem } from '../utils/assetPromptConstants';
import { topLevelCategories } from '../utils/promptGroupCategory';

export type ProductCategoryOption = AssetProductCategory;

export function selectableMajorCategoryId(
  categoryId: string | null | undefined,
  productCategories: ProductCategoryOption[] | undefined,
): string {
  return topLevelCategories(productCategories || []).some(category => category.id === categoryId)
    ? categoryId || '' : '';
}

const PRIMARY_TO_ACTION: Record<string, ActionCategoryId> = {
  jewelry: 'jewelry',
  apparel: 'apparel',
  bag: 'bag',
  shoes: 'shoes',
  beauty: 'beauty',
  eyewear: 'eyewear',
  digital: 'digital_3c',
  digital_3c: 'digital_3c',
};

export function selectedQueueImages(item: ImageSetQueueItem): string[] {
  const excluded = new Set(item.excludedImageIndices || []);
  return item.images.filter((_, index) => !excluded.has(index));
}

export function resolveActionCategory(
  categoryId: string | null | undefined,
  productCategories: ProductCategoryOption[] | undefined,
): string {
  if (!categoryId) return '';
  if (PRIMARY_TO_ACTION[categoryId]) return PRIMARY_TO_ACTION[categoryId];
  const byId = new Map(productCategories?.map((category) => [category.id, category]) || []);
  const visited = new Set<string>();
  let category = byId.get(categoryId);
  while (category?.parentId && !visited.has(category.id)) {
    visited.add(category.id);
    category = byId.get(category.parentId);
  }
  if (category && !category.parentId) return category.id;
  const named = byId.get(categoryId)?.name || categoryId;
  const inferred = inferProductCategoryAndAnatomy(named);
  return PRIMARY_TO_ACTION[inferred.primaryCategory] || PRIMARY_TO_ACTION[inferred.subType || ''] || '';
}

export function categoryForQueueItem(
  item: ImageSetQueueItem,
  fallback: string,
  productCategories: ProductCategoryOption[] | undefined,
): string {
  const manual = selectableMajorCategoryId(fallback, productCategories);
  if (manual) return manual;
  const selected = item.productCategoryId
    ? selectableMajorCategoryId(resolveActionCategory(item.productCategoryId, productCategories), productCategories)
    : '';
  return selected;
}

export function subCategoriesForItem(categoryId: string, categories: ProductCategoryOption[] | undefined) {
  const named = categories?.find((category) => category.id === categoryId)?.name || categoryId;
  const inferred = inferProductCategoryAndAnatomy(named);
  const actionCategory = PRIMARY_TO_ACTION[categoryId] || PRIMARY_TO_ACTION[inferred.primaryCategory];
  return actionCategory ? getSubCategoriesForCategory(actionCategory) : [];
}
