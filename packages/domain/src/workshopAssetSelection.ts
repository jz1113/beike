import type { AssetProductCategory, OrganizedAsset } from './assetOrganization';
import { categoryIds } from './assetOrganization';
import { inferProductCategoryAndAnatomy } from './productCategory';

const FAMILY_NAMES: Record<string, RegExp> = {
  jewelry: /珠宝|首饰|饰品|珠玉|jewelry/i,
  apparel: /服装|服饰|女装|男装|穿搭|apparel/i,
  bag: /箱包|包袋|皮具|bag/i,
  shoes: /鞋靴|鞋履|shoes/i,
  beauty: /美妆|护肤|彩妆|beauty/i,
  eyewear: /眼镜|墨镜|eyewear/i,
  hat_accessory: /帽|围巾|配件/i,
  digital: /手机|通讯|数码|3c|电子|digital/i,
};

/** Product category IDs are independent from style tags and anatomical hints. */
export function resolveWorkshopCategoryScope(
  categories: AssetProductCategory[],
  title: string,
  props?: Record<string, unknown>,
): string[] {
  const text = `${title} ${JSON.stringify(props || {})}`.toLowerCase();
  const inferred = inferProductCategoryAndAnatomy(title, props);
  const directMatches = categories.filter(c => c.name.trim() && text.includes(c.name.trim().toLowerCase()));
  const direct = directMatches.filter(c => !directMatches.some(child => child.parentId === c.id));
  const family = FAMILY_NAMES[inferred.primaryCategory];
  const matched = direct.length ? direct : categories.filter(c => !c.parentId && (
    family?.test(c.name) || (inferred.primaryCategory !== 'all' &&
      inferProductCategoryAndAnatomy(c.name).primaryCategory === inferred.primaryCategory)
  ));
  const ids = new Set<string>();
  for (const category of matched) {
    ids.add(category.id);
    if (category.parentId) ids.add(category.parentId); // Parent assets apply to its children.
    else for (const child of categories.filter(c => c.parentId === category.id)) ids.add(child.id);
  }
  return [...ids];
}

export function isWorkshopAssetApplicable(asset: OrganizedAsset & { provenance?: string }, scope: string[]): boolean {
  return asset.provenance !== 'reference_import' && (asset.isUniversal === true ||
    categoryIds(asset.productCategoryIds).some(id => scope.includes(id)));
}

/** A global manual lock must be suitable for every selected product in a mixed batch. */
export function filterBatchAssetOptions<T extends OrganizedAsset & { provenance?: string }>(
  assets: T[], categories: AssetProductCategory[], items: Array<{ title: string; props?: Record<string, unknown> }>,
): T[] {
  const scopes = items.map(item => resolveWorkshopCategoryScope(categories, item.title, item.props));
  return assets.filter(asset => scopes.length
    ? scopes.every(scope => isWorkshopAssetApplicable(asset, scope))
    : asset.isUniversal === true && asset.provenance !== 'reference_import');
}
