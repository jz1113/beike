import { filterPromptGroupsByFolder } from '@shared/domain/assets/promptGroupFolders';
import { eligiblePromptGroups, isAutoPromptGroupSelection, isWorkshopAssetEligible, promptGroupAppearanceFilter, promptGroupMatchesMajorCategory } from '@shared/domain/workshop/workshop-pipeline';
import { recipeKind } from '@shared/domain/products/productRecipeSelection';
import { productPropsWithCategory, type BatchProductItem } from '../batchTypes';
import type { AnalysisPreflightConfig } from './workshopAnalysisPreflight';
import { isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { audiencesCompatible, audiencesCompatibleWithInherited } from '@shared/domain/assets/appearanceAudience';
import { parseGroupShotSkeleton, sourcePromptSection, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshop-pipeline';

/** Resolve the same candidates shown by preflight; freeze the actual ID before the request. */
export function resolveAnalysisGroup(config: AnalysisPreflightConfig, item: BatchProductItem, recipe: { id: string; name: string; category?: string; promptSnippet?: string }, index: number) {
  const scoped = filterPromptGroupsByFolder(
    (config.availableFullPrompts || []).filter(group => isWorkshopAssetEligible(group, 'full_prompt')),
    config.availableProductCategories || [], config.promptGroupFolderId || 'auto',
  );
  if (!isAutoPromptGroupSelection(config.lockedFullPromptId)) return scoped.find(group => group.id === config.lockedFullPromptId);
  const kind = recipeKind(recipe);
  const major = kind === 'phone' ? 'digital' : kind === 'jewelry' ? 'jewelry' : undefined;
  const candidates = eligiblePromptGroups(major ? scoped.filter(group => promptGroupMatchesMajorCategory(group, major)) : scoped,
    item.title, productPropsWithCategory(item), config.personaMode === 'none' ? 'product' : promptGroupAppearanceFilter(config.lockedFullPromptId));
  // Previous bindings are persisted with the batch, including across page reloads.
  const recent = (config as AnalysisPreflightConfig & { items?: BatchProductItem[] }).items?.map(row => row.appliedFullPromptId).filter(Boolean) || [];
  const fresh = candidates.filter(group => !recent.includes(group.id));
  const pool = fresh.length ? fresh : candidates.filter(group => group.id !== item.appliedFullPromptId);
  const available = pool.length ? pool : candidates;
  return available[Math.abs(index) % available.length];
}

export function resolveAnalysisAppearance(config: AnalysisPreflightConfig, group: WorkshopAssetCandidate, index: number) {
  const portraits = parseGroupShotSkeleton(group.shotPromptsJson).filter(shot => shot.has_human === true && shot.shot_type !== 'hand_held_only');
  if (!portraits.length) return {};
  const options = (id: string, assets: WorkshopAssetCandidate[] = [], type: 'persona' | 'outfit') => {
    if (!id || id === 'auto') return [undefined];
    return assets.filter(asset => isWorkshopAssetEligible(asset, type) && (isAppearanceRotation(id)
      ? matchesAppearanceSelection({ ...asset }, parseAppearanceSelection(id, type === 'outfit'), type === 'outfit') : asset.id === id));
  };
  const pairs = options(config.lockedPersonaId, config.availablePersonas, 'persona').flatMap(persona =>
    options(config.lockedOutfitId, config.availableOutfits, 'outfit').map(outfit => ({ persona, outfit })));
  const compatible = pairs.filter(pair => portraits.every(shot => {
    const person = pair.persona ? { ...pair.persona } : { description: sourcePromptSection(shot.prompt || '', '人物') || sourcePromptSection(shot.prompt || '', '发型与面部') };
    const clothes = pair.outfit ? { ...pair.outfit } : { reversePrompt: sourcePromptSection(shot.prompt || '', '穿搭') || sourcePromptSection(shot.prompt || '', '服装与配饰') };
    return pair.persona && pair.outfit ? audiencesCompatible(person, clothes) : audiencesCompatibleWithInherited(person, clothes);
  }));
  const pair = compatible[Math.abs(index) % compatible.length];
  if (!pair) throw new Error('当前母本没有可用的人物穿搭组合，请调整替换项');
  return { personaId: pair.persona?.id, outfitId: pair.outfit?.id };
}
