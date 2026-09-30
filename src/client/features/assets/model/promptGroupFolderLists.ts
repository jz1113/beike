import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { promptGroupCategoryIds, topLevelCategories } from '../utils/promptGroupCategory';
import { promptGroupSubcategoryOptions, recognizedPromptGroupSubcategory } from '../utils/promptGroupSubcategory';
import type { PromptGroupFolder } from './promptGroupFolder';

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

