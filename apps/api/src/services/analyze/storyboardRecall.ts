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
import { parseGroupShotSkeleton } from '@beike/domain/workshopPipeline';
import { publishedWhere, sortByQuality } from '../promptAsset/recall';
import { recordAssetUsageEvents } from '../promptAsset/usage';

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
  const targetPersonaId = locked.personaId || allocated.personaId;
  const targetSceneId = locked.sceneId || allocated.sceneId;
  const targetOutfitId = locked.outfitId || allocated.outfitId;

  let personaItems: any[] = targetPersonaId
    ? compact(await db.personaAsset.findFirst({ where: { id: String(targetPersonaId), ...PROVENANCE } }))
    : [];
  if (personaItems.length === 0) {
    personaItems = await sortByQuality('persona', await db.personaAsset.findMany({ where: await poolWhere('persona'), orderBy: assetOrder, take: 12 }));
  }
  if (!targetPersonaId && personaItems.length === 0) {
    personaItems = getCategoryTailoredPersonas(titleStr, categoryInfo.targetAnatomy);
  }

  let sceneItems: any[] = targetSceneId
    ? compact(await db.sceneAsset.findFirst({ where: { id: String(targetSceneId), ...PROVENANCE } }))
    : [];
  if (sceneItems.length === 0) {
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
  if (outfitItems.length === 0 && categoryOr.length > 0) {
    outfitItems = await db.outfitAsset.findMany({ where: await poolWhere('outfit', { OR: categoryOr }), orderBy: assetOrder, take: 50 });
  }
  if (outfitItems.length === 0) {
    outfitItems = await db.outfitAsset.findMany({ where: await poolWhere('outfit'), orderBy: assetOrder, take: 50 });
  }
  if (!targetOutfitId && outfitItems.length === 0) {
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

export async function loadLockedGroupSkeleton(fullPromptId?: unknown) {
  const id = String(fullPromptId || '').trim();
  if (!id || id === 'auto') return null;
  const row = await db.fullPromptAsset.findFirst({ where: { id, ...PROVENANCE } });
  if (!row) throw new Error('选定的图组母本不存在，请重新选择');
  const shots = parseGroupShotSkeleton(row.shotPromptsJson);
  let indices: unknown = null;
  try { indices = JSON.parse(row.sourceImageIndices || '[]'); } catch { /* invalid legacy record */ }
  if (!Array.isArray(indices) || indices.length !== 4 || shots.length !== 4) {
    throw new Error('选定的图组母本不是完整的四图组，请重新选择');
  }
  let sourceImages: unknown = null;
  try { sourceImages = JSON.parse(row.sourceImages || '[]'); } catch { /* legacy group without images */ }
  const images = Array.isArray(sourceImages) ? sourceImages : [];
  return {
    id: row.id,
    title: row.title,
    shots: shots.map((shot, index) => ({
      ...shot,
      compositionReferenceImageUrl: typeof images[Number(indices[index]) - 1] === 'string'
        ? images[Number(indices[index]) - 1] as string : undefined,
    })),
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
