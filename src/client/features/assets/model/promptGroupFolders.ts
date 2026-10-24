import { categoryIds, type AssetProductCategory, type PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import {
  PROMPT_GROUP_SUBCATEGORIES,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  promptGroupSubcategoryOptions,
  recognizedPromptGroupSubcategory,
} from '@shared/domain/assets/promptGroupSubcategory';

export interface PromptGroupFolder {
  id: string;
  name: string;
  items: AssetLibrarySlim[];
  isVirtual?: boolean;
}

export type PromptGroupCategoryFilter = string;

export function topLevelCategories(categories: AssetProductCategory[]): AssetProductCategory[] {
  return categories.filter((category) => !category.parentId && !category.isArchived);
}

function categoryRootId(id: string, categories: AssetProductCategory[]): string | null {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  return current && !current.parentId && !current.isArchived ? current.id : null;
}

export function promptGroupCategoryIds(
  item: AssetLibrarySlim,
  categories: AssetProductCategory[],
  albums: PromptAlbum[],
): string[] {
  const assignedIds = categoryIds(item.productCategoryIds);
  const albumId = typeof item.albumId === 'string' ? item.albumId : null;
  // A stored empty array is an explicit “待分类”; only legacy records without this field inherit the album.
  const hasStoredCategories = typeof item.productCategoryIds === 'string' && item.productCategoryIds.trim().length > 0;
  const albumIdValue = !hasStoredCategories && !assignedIds.length && albumId
    ? albums.find((album) => album.id === albumId)?.productCategoryId
    : null;
  const ids = albumIdValue ? [albumIdValue] : assignedIds;
  return [...new Set(ids.map((id) => categoryRootId(id, categories)).filter((id): id is string => !!id))];
}

export function promptGroupCategoryKey(
  item: AssetLibrarySlim,
  categories: AssetProductCategory[],
  albums: PromptAlbum[],
): string {
  if (item.isUniversal) return 'universal';
  return promptGroupCategoryIds(item, categories, albums)[0] || 'unclassified';
}

export function promptGroupCategoryLabel(
  item: AssetLibrarySlim,
  categories: AssetProductCategory[],
  albums: PromptAlbum[],
): string {
  const key = promptGroupCategoryKey(item, categories, albums);
  if (key === 'universal') return '通用商品';
  if (key === 'unclassified') return '待分类';
  const majorName = categories.find((category) => category.id === key)?.name || '待分类';
  const subLabel = item.productSubcategory ? promptGroupSubcategoryLabel(item.productSubcategory, categories, key) : '';
  return subLabel && subLabel !== '待分类' ? `${majorName} · ${subLabel}` : majorName;
}

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

export function buildPromptGroupFolders(
  items: AssetLibrarySlim[], categories: AssetProductCategory[], albums: PromptAlbum[],
): PromptGroupFolder[] {
  const folders: PromptGroupFolder[] = topLevelCategories(categories).map(category => ({
    id: category.id, name: category.name, items: [],
  }));
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const universal: PromptGroupFolder = { id: 'universal', name: '通用商品', items: [], isVirtual: true };
  const unclassified: PromptGroupFolder = { id: 'unclassified', name: '待分类', items: [], isVirtual: true };
  for (const item of items) {
    if (item.isUniversal) {
      universal.items.push(item);
      continue;
    }
    const ids = promptGroupCategoryIds(item, categories, albums);
    if (!ids.length) unclassified.items.push(item);
    else for (const id of ids) byId.get(id)?.items.push(item);
  }
  if (universal.items.length) folders.push(universal);
  if (unclassified.items.length) folders.push(unclassified);
  return folders;
}

export function buildPromptGroupSubcategoryFolders(
  items: AssetLibrarySlim[], categories: AssetProductCategory[], albums: PromptAlbum[], parentId: string,
): PromptGroupFolder[] {
  const folders: PromptGroupFolder[] = promptGroupSubcategoryOptions(categories, parentId)
    .map(option => ({ id: option.id, name: option.label, items: [] }));
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const unclassified: PromptGroupFolder = { id: 'unclassified', name: '待分类', items: [], isVirtual: true };
  for (const item of items) {
    if (!promptGroupCategoryIds(item, categories, albums).includes(parentId)) continue;
    const value = recognizedPromptGroupSubcategory(item.productSubcategory, categories, parentId);
    (value && byId.get(value) || unclassified).items.push(item);
  }
  if (unclassified.items.length) folders.push(unclassified);
  return folders;
}
