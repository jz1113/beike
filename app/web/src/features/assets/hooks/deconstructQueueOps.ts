import {
  getSubCategoriesForCategory,
  inferProductCategoryAndAnatomy,
  type ActionCategoryId,
} from '@beike/domain/productCategory';
import type { ImageSetQueueItem } from '../assetPromptConstants';

export type ProductCategoryOption = { id: string; name: string; parentId?: string | null; position?: number };

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
): ActionCategoryId {
  const named = productCategories?.find((category) => category.id === categoryId)?.name || categoryId || '';
  const inferred = inferProductCategoryAndAnatomy(named);
  return PRIMARY_TO_ACTION[inferred.primaryCategory] || PRIMARY_TO_ACTION[inferred.subType || ''] || 'jewelry';
}

export function categoryForQueueItem(
  item: ImageSetQueueItem,
  fallback: ActionCategoryId,
  productCategories: ProductCategoryOption[] | undefined,
): ActionCategoryId {
  if (!item.productCategoryId) return fallback;
  return resolveActionCategory(item.productCategoryId, productCategories);
}

export function subCategoriesForItem(category: ActionCategoryId) {
  return getSubCategoriesForCategory(category);
}
