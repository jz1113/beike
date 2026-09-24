import { db } from '../../repositories/access';
import {
  getCategoryTailoredOutfits,
  getCategoryTailoredPersonas,
  buildSuitableCategoriesOr,
} from '@beike/domain/jewelryArch';
import {
  pickWeightedRandom,
  computeSamplingSeed,
  stableAssetCode,
} from '@beike/domain/assetSampling';
import { inferProductCategoryAndAnatomy } from '@beike/domain/productCategory';
import { isCompletePromptGroup, parseGroupShotSkeleton } from '@beike/domain/workshopPipeline';
import { publishedWhere, sortByQuality } from '../promptAsset/recall';
import { recordAssetUsageEvents } from '../promptAsset/usage';

import { reservePromptGroup } from './groupRotation';

const PROVENANCE = { provenance: { not: 'reference_import' as const } };
const assetOrder = [
  { isFavorite: 'desc' as const },
  { usageCount: 'desc' as const },
  { createdAt: 'desc' as const },
];

async function poolWhere(type: 'persona' | 'scene' | 'outfit' | 'action', extra: Record<string, unknown> = {}) {
  return { AND: [PROVENANCE, await publishedWhere(type), extra] };
}

export async function loadStoryboardLibrary(input: {
  productTitle?: string;
  productProps?: unknown;
  productIndex: number;
  previousActionIds?: unknown[];
  previousSceneIds?: unknown[];
  allocatedAssets?: Record<string, unknown>;
  lockedAssets?: Record<string, unknown>;
  batchId?: string;
}) {
  const titleStr = `${input.productTitle || ''} ${JSON.stringify(input.productProps || {})}`.toLowerCase();
  const categoryInfo = inferProductCategoryAndAnatomy(input.productTitle, input.productProps as Record<string, any> | null);
  const categoryOr = buildSuitableCategoriesOr(categoryInfo.categoryTags);
  const locked = input.lockedAssets || {};
  const allocated = input.allocatedAssets || {};
  const groupLocked = Boolean(locked.fullPromptId);
  const targetPersonaId = locked.personaId || (!groupLocked && allocated.personaId);
  const targetSceneId = locked.sceneId || (!groupLocked && allocated.sceneId);
  const targetOutfitId = locked.outfitId || (!groupLocked && allocated.outfitId);

  let personaItems: any[] = targetPersonaId
    ? compact(await db.personaAsset.findFirst({ where: { id: String(targetPersonaId), ...PROVENANCE } }))
    : [];
  if (locked.personaId && personaItems.length === 0) {
    throw new Error('锁定的人物资产不存在或已删除，请重新选择');
  }
  if (personaItems.length === 0 && !groupLocked) {
    personaItems = await sortByQuality('persona', await db.personaAsset.findMany({ where: await poolWhere('persona'), orderBy: assetOrder, take: 12 }));
  }
  if (!targetPersonaId && !groupLocked && personaItems.length === 0) {
    personaItems = getCategoryTailoredPersonas(titleStr, categoryInfo.targetAnatomy);
  }

  let sceneItems: any[] = targetSceneId
    ? compact(await db.sceneAsset.findFirst({ where: { id: String(targetSceneId), ...PROVENANCE } }))
    : [];
  if (locked.sceneId && sceneItems.length === 0) {
    throw new Error('锁定的场景资产不存在或已删除，请重新选择');
  }
  if (sceneItems.length === 0 && !groupLocked) {
    let allScenes: any[] = categoryOr.length
      ? await sortByQuality('scene', await db.sceneAsset.findMany({ where: await poolWhere('scene', { OR: categoryOr }), orderBy: assetOrder, take: 100 }))
      : [];
    if (allScenes.length < 15) {
      const general = await sortByQuality('scene', await db.sceneAsset.findMany({ where: await poolWhere('scene'), orderBy: assetOrder, take: 100 }));
      allScenes = [...allScenes, ...general.filter((item) => !allScenes.some((row) => row.id === item.id))];
    }
    const used = new Set((input.previousSceneIds || []).map(String));
    const available = allScenes.filter((item) => !used.has(String(item.id)));
    sceneItems = shuffle(available.length < 3 ? allScenes : available, input.productIndex, input.productTitle).slice(0, 15);
  }

  let outfitItems: any[] = targetOutfitId
    ? compact(await db.outfitAsset.findFirst({ where: { id: String(targetOutfitId), ...PROVENANCE } }))
    : [];
  if (locked.outfitId && outfitItems.length === 0) {
    throw new Error('锁定的穿搭资产不存在或已删除，请重新选择');
  }
  if (outfitItems.length === 0 && !groupLocked && categoryOr.length > 0) {
    outfitItems = await db.outfitAsset.findMany({ where: await poolWhere('outfit', { OR: categoryOr }), orderBy: assetOrder, take: 50 });
  }
  if (outfitItems.length === 0 && !groupLocked) {
    outfitItems = await db.outfitAsset.findMany({ where: await poolWhere('outfit'), orderBy: assetOrder, take: 50 });
  }
  if (!targetOutfitId && !groupLocked && outfitItems.length === 0) {
    outfitItems = getCategoryTailoredOutfits(titleStr, categoryInfo.targetAnatomy);
  }

  const actionItems: any[] = [];

  const samplingSeed = computeSamplingSeed(input.productIndex, input.productTitle || '');
  if (!locked.sceneId && !allocated.sceneId && sceneItems.length > 1) {
    const { picked } = pickWeightedRandom(sceneItems, samplingSeed, new Set((input.previousSceneIds || []).map(String)), 1);
    if (picked.length) sceneItems = picked;
  }
  if (!locked.outfitId && !allocated.outfitId && outfitItems.length > 1) {
    const { picked } = pickWeightedRandom(outfitItems, samplingSeed + 3, new Set(), 1);
    if (picked.length) outfitItems = picked;
  }
  if (!locked.personaId && !allocated.personaId && personaItems.length > 1) {
    const { picked } = pickWeightedRandom(personaItems, samplingSeed + 7, new Set(), 1);
    if (picked.length) personaItems = picked;
  }

  const personas = personaItems.map((item) => ({
    id: item.id, code: stableAssetCode('P', String(item.id)), name: item.name,
    description: item.reversePrompt || item.description, reversePrompt: item.reversePrompt || null,
  }));
  const scenes = sceneItems.map((item) => ({
    id: item.id, code: stableAssetCode('S', String(item.id)), title: item.title,
    description: item.reversePrompt || item.description, lighting: item.lighting, reversePrompt: item.reversePrompt || null,
  }));
  const outfits = outfitItems.map((item) => ({
    id: item.id, code: stableAssetCode('O', String(item.id)), title: item.title, top: item.top, bottom: item.bottom,
    colorPalette: item.colorPalette, reversePrompt: item.reversePrompt || null,
  }));
  const actions: any[] = [];

  if (input.batchId) {
    await recordAssetUsageEvents({
      batchId: input.batchId,
      sceneId: scenes[0]?.id,
      outfitId: outfits[0]?.id,
      personaId: personas[0]?.id,
      eventType: locked.personaId || locked.sceneId || locked.outfitId ? 'locked' : 'recommended',
    });
  }

  return {
    actionItems,
    assetLibraryData: { personas, scenes, outfits, actions },
    usedAssetLibrary: [personas[0], scenes[0], outfits[0], ...actions].some((item) => item?.id && !String(item.id).startsWith('preset-')),
    assetPickTrace: {
      sceneId: scenes[0]?.id, outfitId: outfits[0]?.id, personaId: personas[0]?.id,
    },
  };
}

export async function loadLockedGroupSkeleton(input: {
  fullPromptId?: unknown;
  batchId?: string;
  productTitle?: string;
  productProps?: Record<string, unknown> | null;
  productIndex: number;
}) {
  const id = String(input.fullPromptId || '').trim();
  const manuallyLocked = Boolean(id && id !== 'auto');
  const row = manuallyLocked
    ? await db.fullPromptAsset.findFirst({ where: { id, ...PROVENANCE } })
    : await reservePromptGroup(
        db,
        await db.fullPromptAsset.findMany({
          where: { ...PROVENANCE, sourceImageIndices: { not: null }, shotPromptsJson: { not: null } },
          orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
        }),
        input.productTitle || '', input.productProps, input.batchId,
      );
  if (!row) throw new Error(manuallyLocked
    ? '选定的图组母本不存在，请重新选择'
    : '资产库暂无适配该商品类目的完整四图母本，请导入并解构对应类目的四图组');
  if (!isCompletePromptGroup(row)) {
    throw new Error('选定的图组母本不是完整的四图组，请重新选择');
  }
  const shots = parseGroupShotSkeleton(row.shotPromptsJson);
  return {
    id: row.id,
    title: row.title,
    selectionMode: manuallyLocked ? 'manual' as const : 'auto' as const,
    shots,
    architectureSummary: row.architectureSummary,
    hasHuman: row.hasHuman,
    sceneSummary: row.sceneSummary,
    outfitSummary: row.outfitSummary,
    personaSummary: row.personaSummary,
  };
}

function compact<T>(value: T | null | undefined): T[] {
  return value ? [value] : [];
}

function shuffle<T>(items: T[], productIndex: number, title?: string): T[] {
  const hash = Array.from(String(title || '')).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = (productIndex * 37 + hash * 13) % 10007;
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.abs(seed * (index + 1) + index * 17) % (index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}
