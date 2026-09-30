import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { inferProductCategoryAndAnatomy } from '@shared/domain/products/productCategory';
import { builtinSubcategoryFolderId, isPromptGroupSubcategory, isPromptGroupSubcategoryFolderId, PROMPT_GROUP_SUBCATEGORIES } from '@shared/domain/assets/promptGroupSubcategory';
import { AssetCategoryError } from './assetOrganization';
import { db } from './access';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { matchPromptFolderRules, serializedRuleWords } from '@shared/domain/assets/promptFolderRuleMatch';
import type { SubCategoryDef } from '@shared/domain/products/productCategory';

export type DeconstructMajorCategory = { id: string; name: string; rules?: AssetProductCategory[]; aliases?: string };
export type DeconstructCategoryResolution = {
  categoryId: string | null;
  source: 'selected' | 'vision' | 'title' | 'unclassified';
};

export async function listDeconstructMajorCategories(): Promise<DeconstructMajorCategory[]> {
  const rows = await db.assetProductCategory.findMany({
    where: { workspaceId: requireWorkspaceId(), isArchived: false },
    select: { id: true, name: true, parentId: true, position: true, isArchived: true, keywords: true, anatomy: true, aliases: true },
  });
  return rows.filter(row => !row.parentId).map(row => ({ id: row.id, name: row.name, aliases: row.aliases, rules: rows.filter(node => node.id === row.id || node.parentId === row.id) }));
}

export function deconstructFolderRuleDefinitions(categories: DeconstructMajorCategory[], parentId?: string | null): SubCategoryDef[] {
  return categories.filter(major => !parentId || major.id === parentId).flatMap(major => (major.rules || []).filter(row => !!row.parentId).map(row => ({
    id: row.id, parentId: major.id as SubCategoryDef['parentId'], label: row.name, shortLabel: row.name,
    keywords: [...serializedRuleWords(row.keywords), ...serializedRuleWords(row.aliases)], anatomy: serializedRuleWords(row.anatomy)[0], anatomyOptions: serializedRuleWords(row.anatomy),
  })));
}

export function resolveDeconstructTargetCategory(value: unknown, categories: DeconstructMajorCategory[]): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'unknown' || normalized === 'all') return null;
  const alias = normalized === 'digital' || normalized === 'phone' ? 'digital_3c' : normalized;
  return categories.find(category => category.id.toLowerCase() === alias || category.name.toLowerCase() === alias
    || serializedRuleWords(category.aliases).some(word => word.toLowerCase() === alias))?.id || null;
}

/** A manual selection wins; otherwise use the visual result, then an explicit product title. */
export function resolveDeconstructMajorCategory(params: {
  selectedCategory?: string | null;
  analyzedCategory?: unknown;
  albumName: string;
  categories: DeconstructMajorCategory[];
}): DeconstructCategoryResolution {
  const { selectedCategory, analyzedCategory, albumName, categories } = params;
  const selected = resolveDeconstructTargetCategory(selectedCategory, categories);
  if (selected) return { categoryId: selected, source: 'selected' };

  const analyzed = resolveDeconstructTargetCategory(analyzedCategory, categories);
  if (analyzed) return { categoryId: analyzed, source: 'vision' };

  const configured = matchPromptFolderRules(categories.flatMap(category => category.rules || []), albumName);
  if (configured) return { categoryId: configured.major.id, source: 'title' };

  const inferred = inferProductCategoryAndAnatomy(albumName).primaryCategory;
  const fromTitle = resolveDeconstructTargetCategory(inferred === 'digital' ? 'digital_3c' : inferred, categories);
  if (fromTitle) return { categoryId: fromTitle, source: 'title' };
  return { categoryId: null, source: 'unclassified' };
}

export function recordDeconstructMajorCategory(
  parsedResult: Record<string, unknown>,
  albumName: string,
  selectedCategory: string | undefined,
  categories: DeconstructMajorCategory[],
): string | null {
  const resolved = resolveDeconstructMajorCategory({
    selectedCategory, analyzedCategory: parsedResult.product_major_category, albumName, categories,
  });
  parsedResult.product_major_category = resolved.categoryId || 'unknown';
  parsedResult.product_category_source = resolved.source;
  return resolved.categoryId;
}

export function isValidDeconstructTargetCategory(value: string, categories: DeconstructMajorCategory[]): boolean {
  return resolveDeconstructTargetCategory(value, categories) !== null;
}

/** Explicit import targets are library folders, independent of the model's anatomy taxonomy. */
export async function validateDeconstructTargetSubcategory(value: unknown, majorId: string | null | undefined) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AssetCategoryError('商品细分文件夹无效，请重新选择');
  const selected = value.trim();
  if (!selected) return null;
  if (!majorId) throw new AssetCategoryError('请先选择商品大类，再指定细分文件夹');
  const workspaceId = requireWorkspaceId();
  const major = await db.assetProductCategory.findFirst({
    where: { id: majorId, workspaceId, parentId: null, isArchived: false }, select: { id: true },
  });
  if (!major) throw new AssetCategoryError('所选商品大类已删除，请重新选择');
  const folderId = isPromptGroupSubcategory(selected) ? builtinSubcategoryFolderId(selected) : selected;
  if (!isPromptGroupSubcategoryFolderId(folderId)) throw new AssetCategoryError('请选择资产库中的商品细分文件夹');
  const folder = await db.assetProductCategory.findFirst({ where: { id: folderId, workspaceId } });
  const builtin = majorId === 'digital_3c' ? PROMPT_GROUP_SUBCATEGORIES.find(id => builtinSubcategoryFolderId(id) === folderId) : undefined;
  if (folder ? folder.parentId !== majorId || folder.isArchived : !builtin) {
    throw new AssetCategoryError('所选细分文件夹不存在、已删除或不属于当前商品大类，请重新选择');
  }
  return { folderId, storedValue: builtin || folderId };
}
