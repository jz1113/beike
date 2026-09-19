import { isActionAllowedForProduct } from '@beike/domain/phoneProductPolicy';
import { prisma } from '../../repositories/db';
import { resolveWorkshopCategoryScope } from '@beike/domain/workshopAssetSelection';
import { computeSamplingSeed, pickActionSet, pickWeightedRandom } from '@beike/domain/assetSampling';

const provenanceWhere = { provenance: { not: 'reference_import' } };

/** Read every matching page; library growth must not turn old/high-use rows into a permanent top-N pool. */
async function readPool(model: { findMany: (args: any) => Promise<any[]> }, where: Record<string, unknown>) {
  const rows: any[] = [];
  for (let skip = 0; ; skip += 500) {
    const page = await model.findMany({ where, orderBy: { id: 'asc' }, take: 500, skip });
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function loadStoryboardAssets(params: {
  productTitle?: string;
  productProps?: Record<string, unknown>;
  productIndex: number;
  shotCount: number;
  previousActionIds?: unknown[];
  previousSceneIds?: unknown[];
  lockedAssets?: { personaId?: string; sceneId?: string; outfitId?: string; actionId?: string };
  allocatedAssets?: { personaId?: string; sceneId?: string; outfitId?: string; actionIds?: string[] };
}) {
  const categories = await prisma.assetProductCategory.findMany();
  const scope = resolveWorkshopCategoryScope(categories, params.productTitle || '', params.productProps);
  const applicableWhere = { ...provenanceWhere, OR: [
    ...scope.map(id => ({ productCategoryIds: { contains: JSON.stringify(id) } })),
    { isUniversal: true },
  ] };
  const seed = computeSamplingSeed(params.productIndex, params.productTitle || '');
  const locked = params.lockedAssets || {};
  const allocated = params.allocatedAssets || {};
  const pickOne = async (model: { findMany: (args: any) => Promise<any[]> }, lockedId: string | undefined,
    allocatedId: string | undefined, offset: number, previous: unknown[] = []) => {
    // Manual locks and automatic selections must follow the same category boundary.
    const id = lockedId || allocatedId;
    const pool = await readPool(model, id ? { ...applicableWhere, id } : applicableWhere);
    if (id && !pool.length) throw new Error('所选资产已删除或不适用于当前商品，请重新选择');
    return { poolCount: pool.length, items: pickWeightedRandom(pool, seed + offset,
      new Set(previous.map(String)), 1).picked };
  };
  const [personas, scenes, outfits, unfilteredActionPool] = await Promise.all([
    pickOne(prisma.personaAsset, locked.personaId, allocated.personaId, 7),
    pickOne(prisma.sceneAsset, locked.sceneId, allocated.sceneId, 0, params.previousSceneIds),
    pickOne(prisma.outfitAsset, locked.outfitId, allocated.outfitId, 3),
    readPool(prisma.actionAsset, locked.actionId
      ? { ...applicableWhere, id: locked.actionId }
      : applicableWhere),
  ]);
  const actionPool = unfilteredActionPool.filter(action => isActionAllowedForProduct(params.productTitle || '', action));
  const requestedIds = locked.actionId ? [locked.actionId] : allocated.actionIds;
  let actions: any[];
  if (requestedIds?.length) {
    actions = requestedIds.map(id => actionPool.find(action => action.id === id)).filter(Boolean);
    if (actions.length !== new Set(requestedIds).size) throw new Error('所选动作已删除或不适用于当前商品（手机不使用包装/开箱机位），请重新选择');
  } else {
    actions = pickActionSet(actionPool, seed + 11, new Set((params.previousActionIds || []).map(String)), params.shotCount);
  }
  return {
    personaItems: personas.items,
    sceneItems: scenes.items,
    outfitItems: outfits.items,
    actionItems: actions,
    trace: {
      productCategoryIds: scope,
      productCategoryNames: categories.filter(category => scope.includes(category.id)).map(category => category.name),
      candidateCounts: { personas: personas.poolCount, scenes: scenes.poolCount, outfits: outfits.poolCount, actions: actionPool.length },
      actionPickReason: locked.actionId ? 'user_locked' : requestedIds?.length ? 'batch_allocated' : 'category_weighted_sampling',
      actionShortfall: Math.max(0, params.shotCount - actions.length),
    },
  };
}
