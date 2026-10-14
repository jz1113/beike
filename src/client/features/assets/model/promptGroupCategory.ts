import { categoryIds, type AssetProductCategory, type PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';

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
  return categories.find((category) => category.id === key)?.name || '待分类';
}
