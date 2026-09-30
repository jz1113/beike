import { categoryIds, type AssetProductCategory } from './assetOrganization';
import { builtinSubcategoryFolderId, isPromptGroupSubcategory, promptGroupSubcategoryOptions, recognizedPromptGroupSubcategory } from './promptGroupSubcategory';

export interface PromptGroupSourceFolder {
  id: string;
  name: string;
  majorId: string;
  majorName: string;
  subcategory?: string;
}

export function promptGroupSourceFolders(categories: AssetProductCategory[]): PromptGroupSourceFolder[] {
  return categories.filter(category => !category.parentId && !category.isArchived)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .flatMap(category => [
      { id: category.id, name: category.name, majorId: category.id, majorName: category.name },
      ...promptGroupSubcategoryOptions(categories, category.id).map(folder => ({
        id: folder.folderId, name: folder.label, majorId: category.id, majorName: category.name, subcategory: folder.id,
      })),
    ]);
}

type FolderGroup = { productCategoryIds?: string | null; productSubcategory?: string | null };

function assignedMajorIds(group: FolderGroup, categories: AssetProductCategory[]): string[] {
  const byId = new Map(categories.map(category => [category.id, category]));
  return categoryIds(group.productCategoryIds).flatMap(id => {
    const visited = new Set<string>();
    let current = byId.get(id);
    while (current?.parentId && !current.isArchived && !visited.has(current.id)) {
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    return current && !current.parentId && !current.isArchived ? [current.id] : [];
  });
}

/** Deleted folder assignments never stay in a production pool while cache refresh is pending. */
export function hasActivePromptGroupFolders(group: FolderGroup, categories: AssetProductCategory[]): boolean {
  const ids = categoryIds(group.productCategoryIds);
  const majorIds = assignedMajorIds(group, categories);
  if (ids.length && !majorIds.length) return false;
  const subcategory = group.productSubcategory;
  if (!subcategory) return true;
  const folderId = isPromptGroupSubcategory(subcategory) ? builtinSubcategoryFolderId(subcategory) : subcategory;
  return promptGroupSourceFolders(categories).some(folder => folder.id === folderId && majorIds.includes(folder.majorId));
}

export function promptGroupMatchesSourceFolder(group: FolderGroup, folder: PromptGroupSourceFolder, categories: AssetProductCategory[]): boolean {
  if (!assignedMajorIds(group, categories).includes(folder.majorId)) return false;
  return !folder.subcategory || recognizedPromptGroupSubcategory(group.productSubcategory, categories, folder.majorId) === folder.subcategory;
}

export function filterPromptGroupsByFolder<T extends FolderGroup>(groups: T[], categories: AssetProductCategory[], folderId?: string | null): T[] {
  const active = groups.filter(group => hasActivePromptGroupFolders(group, categories));
  if (!folderId || folderId === 'auto') return active;
  const folder = promptGroupSourceFolders(categories).find(item => item.id === folderId);
  return folder ? active.filter(group => promptGroupMatchesSourceFolder(group, folder, categories)) : [];
}
