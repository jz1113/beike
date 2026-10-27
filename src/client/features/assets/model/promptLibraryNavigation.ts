import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildPromptGroupFolders, buildPromptGroupSubcategoryFolders, promptGroupSubcategoryOptions, topLevelCategories } from './promptGroupFolders';

export function buildCategorySkillNavigation(items: AssetLibrarySlim[], categories: AssetProductCategory[], albums: PromptAlbum[]) {
  return topLevelCategories(categories).flatMap(root => {
    const folders = buildPromptGroupSubcategoryFolders(items, categories, albums, root.id);
    return promptGroupSubcategoryOptions(categories, root.id).map(child => ({
      ...child, parent: root.name, parentId: root.id,
      count: folders.find(folder => folder.id === child.id)?.items.length || 0,
    }));
  });
}

export function buildPromptLibraryNavigation(items: AssetLibrarySlim[], categories: AssetProductCategory[], albums: PromptAlbum[]) {
  return buildPromptGroupFolders(items, categories, albums).map(folder => ({
    id: folder.id, name: folder.name, count: folder.items.length, isVirtual: folder.isVirtual,
    children: folder.isVirtual ? [] : buildPromptGroupSubcategoryFolders(items, categories, albums, folder.id)
      .map(child => ({ id: child.id, name: child.name, count: child.items.length })),
  }));
}

export function filterPromptLibraryNavigation(folders: ReturnType<typeof buildPromptLibraryNavigation>, query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return folders;
  return folders.flatMap(folder => {
    if (folder.name.toLocaleLowerCase().includes(term)) return [folder];
    const children = folder.children.filter(child => child.name.toLocaleLowerCase().includes(term));
    return children.length ? [{ ...folder, children }] : [];
  });
}

/** Browsing stays focused on populated folders; the current empty selection remains reachable. */
export function populatedPromptLibraryNavigation(folders: ReturnType<typeof buildPromptLibraryNavigation>, category: string, subcategory: string) {
  return folders.filter(folder => folder.count > 0 || folder.id === category).map(folder => ({
    ...folder,
    children: folder.children.filter(child => child.count > 0 || (folder.id === category && child.id === subcategory)),
  }));
}
