import { storyboardAssetsRepository } from '../../repositories/storyboardAssets';
import {
  getCategoryTailoredOutfits,
  getCategoryTailoredPersonas,
  buildSuitableCategoriesOr,
} from '@shared/domain/products/jewelryArch';
import {
  pickWeightedRandom,
  computeSamplingSeed,
  stableAssetCode,
} from '@shared/domain/assets/assetSampling';
import { inferProductCategoryAndAnatomy } from '@shared/domain/products/productCategory';
import { categoryIds } from '@shared/domain/assets/assetOrganization';
import { filterPromptGroupsByFolder, hasActivePromptGroupFolders, promptGroupSourceFolders } from '@shared/domain/assets/promptGroupFolders';
import { builtinSubcategoryFolderId, isPromptGroupSubcategory, PROMPT_GROUP_SUBCATEGORY_LABELS } from '@shared/domain/assets/promptGroupSubcategory';
import { eligiblePromptGroups, isAutoPromptGroupSelection, isCompletePromptGroup, isWorkshopAssetEligible, parseGroupShotSkeleton, promptGroupAppearance, promptGroupAppearanceFilter, promptGroupCategoryFit, promptGroupExplicitMajorCategoryConflict, promptGroupExplicitSubcategoryConflict, promptGroupMatchesMajorCategory, type PromptGroupAppearanceFilter } from '@shared/domain/workshop/workshopPipeline';
import { publishedWhere, sortByQuality } from '../promptAsset/recall';
import { recordAssetUsageEvents } from '../promptAsset/usage';
import { readFullPromptLibraryNumbers } from '@server/repositories/fullPromptNumbers';

import { reservePromptGroup } from './groupRotation';

const PROVENANCE = { provenance: { not: 'reference_import' as const } };
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
    ? compact(await storyboardAssetsRepository.findPersona({ AND: [{ id: String(targetPersonaId) }, await poolWhere('persona')] }))
    : [];
  personaItems = personaItems.filter(row => isWorkshopAssetEligible(row, 'persona'));
  if (locked.personaId && personaItems.length === 0) {
    throw new Error('锁定的人物资产不可用（未发布、占位记录或已删除），请重新选择');
  }
  if (personaItems.length === 0 && !groupLocked) {
    personaItems = await sortByQuality('persona', await storyboardAssetsRepository.listPersonas(await poolWhere('persona')));
  }
  if (!targetPersonaId && !groupLocked && personaItems.length === 0) {
    personaItems = getCategoryTailoredPersonas();
  }

  let sceneItems: any[] = targetSceneId
    ? compact(await storyboardAssetsRepository.findScene({ AND: [{ id: String(targetSceneId) }, await poolWhere('scene')] }))
    : [];
  sceneItems = sceneItems.filter(row => isWorkshopAssetEligible(row, 'scene'));
  if (locked.sceneId && sceneItems.length === 0) {
    throw new Error('锁定的场景资产不可用（未发布或已删除），请重新选择');
  }
  if (sceneItems.length === 0 && !groupLocked) {
    let allScenes: any[] = categoryOr.length
      ? await sortByQuality('scene', await storyboardAssetsRepository.listScenes(await poolWhere('scene', { OR: categoryOr })))
      : [];
    if (allScenes.length < 15) {
      const general = await sortByQuality('scene', await storyboardAssetsRepository.listScenes(await poolWhere('scene')));
      allScenes = [...allScenes, ...general.filter((item) => !allScenes.some((row) => row.id === item.id))];
    }
    const used = new Set((input.previousSceneIds || []).map(String));
    const available = allScenes.filter((item) => !used.has(String(item.id)));
    sceneItems = shuffle(available.length < 3 ? allScenes : available, input.productIndex, input.productTitle).slice(0, 15);
  }

  let outfitItems: any[] = targetOutfitId
    ? compact(await storyboardAssetsRepository.findOutfit({ AND: [{ id: String(targetOutfitId) }, await poolWhere('outfit')] }))
    : [];
  outfitItems = outfitItems.filter(row => isWorkshopAssetEligible(row, 'outfit'));
  if (locked.outfitId && outfitItems.length === 0) {
    throw new Error('锁定的穿搭资产不可用（未发布、占位记录或已删除），请重新选择');
  }
  if (outfitItems.length === 0 && !groupLocked && categoryOr.length > 0) {
    outfitItems = await storyboardAssetsRepository.listOutfits(await poolWhere('outfit', { OR: categoryOr }));
  }
  if (outfitItems.length === 0 && !groupLocked) {
    outfitItems = await storyboardAssetsRepository.listOutfits(await poolWhere('outfit'));
  }
  if (!targetOutfitId && !groupLocked && outfitItems.length === 0) {
    outfitItems = getCategoryTailoredOutfits(titleStr, categoryInfo.targetAnatomy);
  }

  const actionItems: any[] = [];

  personaItems = personaItems.filter(row => isWorkshopAssetEligible(row, 'persona'));
  outfitItems = outfitItems.filter(row => isWorkshopAssetEligible(row, 'outfit'));

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
    dimensions: item.dimensions, tags: item.tags, id: item.id, code: stableAssetCode('P', String(item.id)), name: item.name,
    description: item.reversePrompt || item.description, reversePrompt: item.reversePrompt || null,
  }));
  const scenes = sceneItems.map((item) => ({
    id: item.id, code: stableAssetCode('S', String(item.id)), title: item.title,
    description: item.reversePrompt || item.description, lighting: item.lighting, reversePrompt: item.reversePrompt || null,
  }));
  const outfits = outfitItems.map((item) => ({
    dimensions: item.dimensions, tags: item.tags, id: item.id, code: stableAssetCode('O', String(item.id)), title: item.title, top: item.top, bottom: item.bottom,
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
  groupFolderId?: unknown;
  groupAppearance?: PromptGroupAppearanceFilter;
  architectureMajor?: 'digital' | 'jewelry';
  batchId?: string;
  productId?: string;
  analysisRunId?: string;
  productTitle?: string;
  productProps?: Record<string, unknown> | null;
  productIndex: number;
}) {
  const id = String(input.fullPromptId || '').trim();
  const manuallyLocked = !isAutoPromptGroupSelection(id);
  const appearance = input.groupAppearance || promptGroupAppearanceFilter(id);
  const categories = await storyboardAssetsRepository.listProductCategories();
  const folderId = String(input.groupFolderId || 'auto').trim();
  const folder = folderId === 'auto' ? undefined : promptGroupSourceFolders(categories).find(item => item.id === folderId);
  if (folderId !== 'auto' && !folder) throw new Error('母本文件夹已删除或不可用，请在生产设置中重新选择');
  if (folder && input.architectureMajor && !promptGroupMatchesMajorCategory({
    productCategoryIds: JSON.stringify([folder.majorId]), productCategoryNames: [folder.majorName],
  }, input.architectureMajor)) throw new Error('母本文件夹与当前拍摄架构的商品大类不符，请调整文件夹或拍摄架构');
  const categoryNames = new Map(categories.filter(category => !category.isArchived).map(category => [category.id, category.name]));
  const withCategoryNames = <T extends { productCategoryIds: string; productSubcategory?: string | null }>(group: T) => ({
    ...group,
    productCategoryRules: categories,
    productCategoryNames: categoryIds(group.productCategoryIds).map(categoryId => categoryNames.get(categoryId)).filter((name): name is string => !!name),
    productSubcategoryName: isPromptGroupSubcategory(group.productSubcategory)
      ? categoryNames.get(builtinSubcategoryFolderId(group.productSubcategory)) || PROMPT_GROUP_SUBCATEGORY_LABELS[group.productSubcategory]
      : categoryNames.get(group.productSubcategory || '') || null,
  });
  const availableGroups = manuallyLocked ? []
    : filterPromptGroupsByFolder((await storyboardAssetsRepository.listCompleteGroups({ AND: [PROVENANCE, await publishedWhere('full_prompt'), { sourceImageIndices: { not: null }, shotPromptsJson: { not: null } }] }))
      .filter(group => isWorkshopAssetEligible(group, 'full_prompt')).map(withCategoryNames)
      .filter(group => !input.architectureMajor || promptGroupMatchesMajorCategory(group, input.architectureMajor)), categories, folderId);
  const eligibleCount = manuallyLocked ? 1
    : eligiblePromptGroups(availableGroups, input.productTitle || '', input.productProps, appearance).length;
  const lockedRow = manuallyLocked
    ? await storyboardAssetsRepository.findGroup({ AND: [{ id }, PROVENANCE, await publishedWhere('full_prompt')] })
    : null;
  const row = manuallyLocked
    ? (lockedRow ? withCategoryNames(lockedRow) : null)
    : await reservePromptGroup(
        availableGroups,
        input.productTitle || '', input.productProps, input.batchId, appearance, input.productId, input.analysisRunId,
      );
  if (!row) throw new Error(manuallyLocked
    ? '选定的图组母本不存在、未发布或已停用，请重新选择'
    : `资产库暂无适配该商品类目的${appearance === 'human' ? '含人物镜头' : appearance === 'product' ? '全组无人物' : ''}完整四图母本，请调整出镜要求或导入并解构对应图组`);
  if (!isWorkshopAssetEligible(row, 'full_prompt') || !isCompletePromptGroup(row)) {
    throw new Error('选定的图组母本不是完整的四图组，请重新选择');
  }
  if (!hasActivePromptGroupFolders(row, categories) || !filterPromptGroupsByFolder([row], categories, folderId).length) {
    throw new Error('选定的图组母本不在当前有效文件夹内，请更换母本或调整文件夹');
  }
  if (input.architectureMajor && !promptGroupMatchesMajorCategory(row, input.architectureMajor)) {
    throw new Error('选定的图组母本不属于当前拍摄架构的商品大类，请更换母本或核对其分类');
  }
  if (manuallyLocked) {
    const majorConflict = promptGroupExplicitMajorCategoryConflict(row, input.productTitle || '', input.productProps);
    if (majorConflict) throw new Error(`${majorConflict}，请更换母组或核对其商品大类归属`);
    const conflict = promptGroupExplicitSubcategoryConflict(row, input.productTitle || '', input.productProps);
    if (conflict) throw new Error(`${conflict}，请更换母组或核对其商品细分分类`);
    if (promptGroupCategoryFit(row, input.productTitle || '', input.productProps) <= 0) {
      throw new Error('选定的图组母本与当前商品品类或细分不匹配，请更换母组或核对分类');
    }
  }
  const shots = parseGroupShotSkeleton(row.shotPromptsJson);
  const groupAppearance = promptGroupAppearance(row);
  return {
    id: row.id,
    title: row.title,
    displayNumber: (await readFullPromptLibraryNumbers()).get(row.id) ?? null,
    groupIndex: row.groupIndex,
    albumName: row.albumName,
    selectionMode: manuallyLocked ? 'manual' as const : 'auto' as const,
    shots,
    architectureSummary: row.architectureSummary,
    hasHuman: groupAppearance === 'unknown' ? row.hasHuman : groupAppearance === 'human',
    groupAppearance,
    eligibleCount,
    inventoryCount: manuallyLocked ? 1 : availableGroups.length,
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
