import {
  getSubCategoriesForCategory,
  inferProductCategoryAndAnatomy,
  type ActionCategoryId,
} from '@shared/domain/products/productCategory';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import type { ImageSetQueueItem } from '../model/assetPromptConstants';
import { topLevelCategories } from '../model/promptGroupFolders';

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

export function organizeQueueIntoFourImageGroups(queue: ImageSetQueueItem[]): ImageSetQueueItem[] {
  const result: ImageSetQueueItem[] = [];
  const remainderImages: string[] = [];
  let remainderTemplate: ImageSetQueueItem | null = null;

  for (const item of queue) {
    if (item.status === 'done' || item.status === 'processing') {
      result.push(item);
      continue;
    }
    const selected = selectedQueueImages(item);
    if (selected.length === 4 && item.images.length === 4 && (!item.excludedImageIndices || item.excludedImageIndices.length === 0)) {
      result.push(item);
      continue;
    }
    const baseName = item.name.replace(/\s*·\s*组\s*\d+$/, '').trim() || '参考图组';
    const totalFullGroups = Math.floor(selected.length / 4);
    for (let g = 0; g < totalFullGroups; g++) {
      const slice = selected.slice(g * 4, g * 4 + 4);
      result.push({
        ...item,
        id: g === 0 ? item.id : `${item.id}_g${g + 1}_${Math.random().toString(36).slice(2, 6)}`,
        name: totalFullGroups > 1 ? `${baseName} · 组 ${g + 1}` : item.name,
        images: slice,
        excludedImageIndices: undefined,
        status: 'pending',
        error: undefined,
      });
    }
    const leftover = selected.slice(totalFullGroups * 4);
    if (leftover.length > 0) {
      if (!remainderTemplate) remainderTemplate = item;
      remainderImages.push(...leftover);
    }
  }

  const pooledGroups = Math.floor(remainderImages.length / 4);
  for (let g = 0; g < pooledGroups; g++) {
    const slice = remainderImages.slice(g * 4, g * 4 + 4);
    const tpl = remainderTemplate;
    result.push({
      id: tpl && g === 0 && !result.some(r => r.id === tpl.id) ? tpl.id : `queue_pool_${Date.now()}_${g}_${Math.random().toString(36).slice(2, 6)}`,
      name: pooledGroups > 1 ? `自动合并图组 · 组 ${g + 1}` : (tpl?.name || '自动合并图组'),
      images: slice,
      sourceUrl: tpl?.sourceUrl,
      author: tpl?.author,
      productCategoryId: tpl?.productCategoryId,
      status: 'pending',
    });
  }

  return result;
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

import {
  getEnabledMultimodalModelsFromSettings,
  resolveStoredMultimodalModelId,
  type WorkflowCapability,
} from '@shared/domain/models/workflowModels';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { isVisionCapableModel } from '@shared/domain/prompts/vision';

export function loadMultimodalModels(): WorkflowCapability[] {
  const synced = modalityPickerSelections('chat')?.filter((item) => isVisionCapableModel(item.modelId));
  if (synced && synced.length > 0) {
    return synced.map((item) => ({
      id: item.id,
      routeId: item.entryId,
      name: item.name || item.modelId,
      shortName: (item.name || item.modelId).split(' · ')[0],
      provider: item.provider,
      isVision: true,
      enabled: true,
    }));
  }
  return getEnabledMultimodalModelsFromSettings();
}

export function defaultDeconstructModelId(models: WorkflowCapability[]): string {
  return models.find((model) => model.id === 'gemini-3.7-flash')?.id
    || models.find((model) => /flash/i.test(model.id) && !model.isThinking)?.id
    || resolveStoredMultimodalModelId(models);
}
