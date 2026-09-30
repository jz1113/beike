import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { builtinSubcategoryFolderId, isPromptGroupSubcategory, promptGroupSubcategoryOptions } from '@shared/domain/assets/promptGroupSubcategory';

/** Include existing built-in folders without writing records merely to open a dialog. */
export function promptFolderRuleCategories(categories: AssetProductCategory[]): AssetProductCategory[] {
  const activeRoots = new Set(categories.filter(category => !category.parentId && !category.isArchived).map(category => category.id));
  const active = categories.filter(category => !category.isArchived && category.id !== 'universal' && category.id !== 'unclassified'
    && (!category.parentId || activeRoots.has(category.parentId)));
  if (!active.some(category => category.id === 'digital_3c' && !category.parentId)) return active;
  const digital = active.find(category => category.id === 'digital_3c');
  const builtins = promptGroupSubcategoryOptions(categories, 'digital_3c')
    .filter(option => !active.some(category => category.id === option.folderId))
    .map((option, index) => ({ id: option.folderId, name: option.label, parentId: 'digital_3c', position: index,
      keywords: '[]', anatomy: '[]', isReadOnly: digital?.isReadOnly }));
  return [...active, ...builtins];
}

export function promptFolderRuleCategory(categories: AssetProductCategory[], id: string, parentId?: string) {
  const canonicalId = parentId === 'digital_3c' && isPromptGroupSubcategory(id) ? builtinSubcategoryFolderId(id) : id;
  const category = categories.find(value => value.id === canonicalId && !value.isArchived);
  return category && (!parentId || category.parentId === parentId) ? category : undefined;
}
