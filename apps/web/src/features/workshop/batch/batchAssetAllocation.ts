import { isActionAllowedForProduct } from '@beike/domain/phoneProductPolicy';
import type { AssetProductCategory, OrganizedAsset } from '@beike/domain/assetOrganization';
import type { SampleableAsset } from '@beike/domain/assetSampling';
import { computeSamplingSeed, pickActionSet } from '@beike/domain/assetSampling';
import { isWorkshopAssetApplicable, resolveWorkshopCategoryScope } from '@beike/domain/workshopAssetSelection';

/** Reserve all batch actions before launching concurrent model requests. */
export function allocateBatchActions<T extends SampleableAsset & OrganizedAsset>(
  items: Array<{ id: string; title: string; props?: Record<string, unknown> }>,
  actions: T[],
  categories: AssetProductCategory[],
  shotCount: number,
  previousActionIds: string[] = [],
): Map<string, T[]> {
  const used = new Set(previousActionIds);
  const allocated = new Map<string, T[]>();
  items.forEach((item, index) => {
    const scope = resolveWorkshopCategoryScope(categories, item.title, item.props);
    const pool = actions.filter(action => isWorkshopAssetApplicable(action, scope) && isActionAllowedForProduct(item.title, action));
    const picked = pickActionSet(pool, computeSamplingSeed(index, item.title) + 11, used, shotCount);
    allocated.set(item.id, picked);
    picked.forEach(action => used.add(action.id));
  });
  return allocated;
}
