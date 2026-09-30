import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { promptGroupSubcategoryOptions } from '@shared/domain/assets/promptGroupSubcategory';

export function deconstructSubcategoryOptions(majorId: string, categories: AssetProductCategory[] = []) {
  if (!categories.some(category => category.id === majorId && !category.parentId && !category.isArchived)) return [];
  return promptGroupSubcategoryOptions(categories, majorId);
}

/** Send the folder identity, including for legacy phone/case selections. */
export function selectableDeconstructSubcategory(
  value: string | null | undefined, majorId: string, categories: AssetProductCategory[] = [],
): string {
  if (!value) return '';
  return deconstructSubcategoryOptions(majorId, categories)
    .find(option => option.id === value || option.folderId === value)?.folderId || '';
}

export function deconstructImportTargetHint(
  majorId: string, subcategory: string, categories: AssetProductCategory[] = [],
): string {
  const major = categories.find(category => category.id === majorId && !category.parentId && !category.isArchived);
  if (!major) return '按每套图集识别商品及归档文件夹，无法判断时保留在待分类。';
  const child = deconstructSubcategoryOptions(majorId, categories).find(option => option.folderId === subcategory);
  if (child) return `本批待反推图集统一归档至「${major.name} / ${child.label}」。`;
  return deconstructSubcategoryOptions(majorId, categories).length
    ? `归档至「${major.name}」，自动匹配二级文件夹；无法判断时保留在该大类的待分类。`
    : `归档至「${major.name}」；该大类暂无二级文件夹。`;
}
