import { isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { appearanceAudience, audiencesCompatible, audiencesCompatibleWithInherited } from '@shared/domain/assets/appearanceAudience';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { filterPromptGroupsByFolder, promptGroupSourceFolders } from '@shared/domain/assets/promptGroupFolders';
import { recipeKind, resolveRecipeForProduct, type RecipeForProduct } from '@shared/domain/products/productRecipeSelection';
import { eligiblePromptGroups, isAutoPromptGroupSelection, isWorkshopAssetEligible, parseGroupShotSkeleton, promptGroupAppearance, promptGroupAppearanceFilter, promptGroupCategoryFit, promptGroupExplicitMajorCategoryConflict, promptGroupExplicitSubcategoryConflict, promptGroupMatchesMajorCategory, sourcePromptSection, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshop-pipeline';
import { productPropsWithCategory, type BatchProductItem } from '../batchTypes';

type GroupWithAppearance = WorkshopAssetCandidate & {
  personaSummary?: string | null;
  outfitSummary?: string | null;
};

function selectedAppearanceAssets(id: string, options: WorkshopAssetCandidate[], type: 'persona' | 'outfit'): Array<WorkshopAssetCandidate | null> {
  if (!id || id === 'auto') return [null];
  if (isAppearanceRotation(id)) {
    const selection = parseAppearanceSelection(id, type === 'outfit');
    return options.filter(row => isWorkshopAssetEligible(row, type)
      && matchesAppearanceSelection({ ...row }, selection, type === 'outfit'));
  }
  const chosen = options.find(row => row.id === id && isWorkshopAssetEligible(row, type));
  return chosen ? [chosen] : [];
}

function inheritedAppearance(group: GroupWithAppearance, shotPrompt: string) {
  return {
    persona: sourcePromptSection(shotPrompt, '人物')
      || sourcePromptSection(shotPrompt, '发型与面部')
      || group.personaSummary || '',
    outfit: sourcePromptSection(shotPrompt, '穿搭')
      || sourcePromptSection(shotPrompt, '服装与配饰')
      || group.outfitSummary || '',
  };
}

function appearancePairWorksForGroup(
  group: GroupWithAppearance,
  personas: Array<WorkshopAssetCandidate | null>,
  outfits: Array<WorkshopAssetCandidate | null>,
): boolean {
  const portraitShots = parseGroupShotSkeleton(group.shotPromptsJson).filter(shot =>
    shot.shot_type !== 'hand_held_only' && shot.shot_type !== 'pure_product' && shot.has_human !== false);
  if (!portraitShots.length) return true;
  const inherited = portraitShots.map(shot => inheritedAppearance(group, shot.prompt || ''));
  return personas.some(personaAsset => outfits.some(outfitAsset => inherited.every(source => {
    const persona = personaAsset ? { ...personaAsset } : { description: source.persona };
    const outfit = outfitAsset ? { ...outfitAsset } : { reversePrompt: source.outfit };
    return personaAsset && outfitAsset
      ? audiencesCompatible(persona, outfit)
      : audiencesCompatibleWithInherited(persona, outfit);
  })));
}

export interface AnalysisPreflightConfig {
  selectedArchId: string;
  recipes: RecipeForProduct[];
  assetLoadState?: 'loading' | 'ready' | 'error';
  assetLoadError?: string;
  lockedFullPromptId?: string;
  promptGroupFolderId?: string;
  availableProductCategories?: AssetProductCategory[];
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  personaMode?: 'asset_driven' | 'none';
  availableFullPrompts?: WorkshopAssetCandidate[];
  availablePersonas?: WorkshopAssetCandidate[];
  availableScenes?: WorkshopAssetCandidate[];
  availableOutfits?: WorkshopAssetCandidate[];
}

/** Shared by single-product, batch and assisted analysis; no paid calls here. */
export function workshopAnalysisBlockReason(config: AnalysisPreflightConfig, item: BatchProductItem): string | null {
  if (item.status !== 'success') return '请先完成商品采集';
  if (!item.selectedProductImages?.some(url => typeof url === 'string' && url.trim())) return '请先选择并确认商品参考图';
  const productProps = productPropsWithCategory(item);
  const architecture = resolveRecipeForProduct(config.recipes, config.selectedArchId, item);
  if (!architecture.recipe) return architecture.error;
  const architectureKind = recipeKind(architecture.recipe);
  const architectureMajor = architectureKind === 'phone' ? 'digital' : architectureKind === 'jewelry' ? 'jewelry' : undefined;
  if (config.assetLoadState === 'loading') return '正在加载生产资产，请稍后再分析';
  if (config.assetLoadState === 'error') return `生产资产加载失败，请在生产设置中重新加载：${config.assetLoadError || '请求失败'}`;
  const categories = config.availableProductCategories || [];
  const folderId = config.promptGroupFolderId || 'auto';
  const folder = folderId === 'auto' ? undefined : promptGroupSourceFolders(categories).find(row => row.id === folderId);
  if (folderId !== 'auto' && !folder) return '母本文件夹已删除或不可用，请在生产设置中重新选择';
  if (folder && architectureMajor && !promptGroupMatchesMajorCategory({
    productCategoryIds: JSON.stringify([folder.majorId]), productCategoryNames: [folder.majorName],
  }, architectureMajor)) return '母本文件夹与当前拍摄架构的商品大类不符，请调整文件夹或拍摄架构';
  const allGroups = (config.availableFullPrompts || []).filter(group => isWorkshopAssetEligible(group, 'full_prompt'));
  const groups = filterPromptGroupsByFolder(allGroups, categories, folderId);
  const explicitGroup = !isAutoPromptGroupSelection(config.lockedFullPromptId);
  const group = explicitGroup ? groups.find(row => row.id === config.lockedFullPromptId) : undefined;
  if (explicitGroup && !group) return allGroups.some(row => row.id === config.lockedFullPromptId)
    ? '锁定的图组母本不在当前母本文件夹内，请更换图组或调整文件夹'
    : '锁定的图组母本已失效、未发布或不完整，请重新选择';
  if (group && architectureMajor && !promptGroupMatchesMajorCategory(group, architectureMajor)) {
    return '锁定的图组母本不属于当前拍摄架构的商品大类，请重新选择或在资产库核对母本分类';
  }
  if (group) {
    const majorConflict = promptGroupExplicitMajorCategoryConflict(group, item.title, productProps);
    if (majorConflict) return `${majorConflict}，请更换母组或核对其商品大类归属`;
    const conflict = promptGroupExplicitSubcategoryConflict(group, item.title, productProps);
    if (conflict) return `${conflict}，请更换母组或核对其商品细分分类`;
    if (promptGroupCategoryFit(group, item.title, productProps) <= 0) return '锁定的图组母本与当前商品品类或细分不匹配，请更换母组或核对分类';
  }
  const requestedAppearance = promptGroupAppearanceFilter(config.lockedFullPromptId);
  if (config.personaMode === 'none' && requestedAppearance === 'human') return '当前设置为无人像出镜，请将参考图组改为“全组无人物”或“全部图组”轮换';
  if (config.personaMode === 'none' && group && promptGroupAppearance(group) !== 'product') return '当前设置为无人像出镜，不能固定使用含人物镜头或出镜待判定的图组';
  const appearanceFilter = config.personaMode === 'none' ? 'product' : requestedAppearance;
  const architectureGroups = architectureMajor
    ? groups.filter(row => promptGroupMatchesMajorCategory(row, architectureMajor)) : groups;
  const candidates = explicitGroup ? [] : eligiblePromptGroups(architectureGroups, item.title, productProps, appearanceFilter);
  if (!explicitGroup && candidates.length === 0) return appearanceFilter === 'human'
    ? '没有适配该商品的已发布含人物镜头四图母本，请切换出镜范围或补充素材'
    : appearanceFilter === 'product'
      ? '没有适配该商品的已发布全组无人物四图母本，请切换出镜范围或补充素材'
      : '没有适配该商品的已发布四图母本，请到资产库导入并审核发布';
  const portraitGroups = (group ? [group] : candidates).filter(candidate => promptGroupAppearance(candidate) === 'human');
  const acceptsPeople = portraitGroups.length > 0;
  const bindings = [
    { id: config.lockedSceneId, options: config.availableScenes, type: 'scene' as const, label: '场景', active: true },
    { id: config.lockedPersonaId, options: config.availablePersonas, type: 'persona' as const, label: '人物', active: acceptsPeople },
    { id: config.lockedOutfitId, options: config.availableOutfits, type: 'outfit' as const, label: '穿搭', active: acceptsPeople },
  ];
  for (const binding of bindings) {
    if (!binding.active || !binding.id || binding.id === 'auto') continue;
    if (isAppearanceRotation(binding.id) && binding.type !== 'scene') {
      const selection = parseAppearanceSelection(binding.id, binding.type === 'outfit');
      if (!binding.options?.some(row => isWorkshopAssetEligible(row, binding.type) && matchesAppearanceSelection({ ...row }, selection, binding.type === 'outfit'))) return `暂无可轮换的已发布${binding.label}资产，请先补充素材或沿用母本`;
      continue;
    }
    const chosen = binding.options?.find(row => row.id === binding.id && isWorkshopAssetEligible(row, binding.type));
    if (!chosen) {
      return `锁定的${binding.label}资产已失效、未发布或属于占位记录，请重新选择或沿用母本`;
    }
    if (binding.type !== 'scene' && appearanceAudience({ ...chosen }, binding.type === 'outfit') === 'unknown') {
      return `锁定的${binding.label}资产仍为待分类，请先在资产库确认适用人群，或重新选择已分类资产`;
    }
  }
  if (!acceptsPeople || (config.lockedPersonaId === 'auto' && config.lockedOutfitId === 'auto')) return null;
  const personas = selectedAppearanceAssets(config.lockedPersonaId, config.availablePersonas || [], 'persona');
  const outfits = selectedAppearanceAssets(config.lockedOutfitId, config.availableOutfits || [], 'outfit');
  const rotating = isAppearanceRotation(config.lockedPersonaId) || isAppearanceRotation(config.lockedOutfitId);
  for (const candidate of portraitGroups) {
    if (appearancePairWorksForGroup(candidate, personas, outfits)) continue;
    return rotating
      ? '所选范围内没有可与当前图组母本兼容的人物穿搭组合，请调整轮换范围、同时替换人物与穿搭，或改选图组'
      : config.lockedPersonaId !== 'auto' && config.lockedOutfitId !== 'auto'
        ? '所选人物与穿搭的性别、年龄段不匹配或尚未分类，请在资产库选择兼容的已发布组合'
        : '所选人物或穿搭与母本镜头的性别、年龄段明显冲突，请调整替换项，或同时替换人物与穿搭';
  }
  return null;
}
