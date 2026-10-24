import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import type { ShotPrompt } from '@shared/domain/prompts/vision';

/** Fields frozen into a generation attempt. Local so execution does not depend back on this module. */
export interface LearningTaskConfig {
  selectedImageGenModel: string;
  selectedAspect: string;
  selectedQuality: string;
  anchorFaceUrl?: string;
  productReferenceImages?: string[];
}

/** Freeze at submission; later reanalysis must not relabel an existing result. */
export function captureLearningContext(item: BatchProductItem, shot: ShotPrompt, config: LearningTaskConfig, strategy: 'single_shot' | 'grid_first'): BatchTaskItem['learningContext'] {
  const skill = item.appliedSkillSnapshot;
  if (!skill?.learningScopeId || !skill.learningReferenceFingerprint || !item.appliedFullPromptId) return undefined;
  return {
    scopeId: skill.learningScopeId, versionId: skill.learningVersionId || '',
    referenceFingerprint: skill.learningReferenceFingerprint, baseRecipeVersion: skill.baseRecipeVersion || '',
    groupId: item.appliedFullPromptId,
    productImages: config.productReferenceImages || [...new Set([item.selectedProductImages[0] || item.coverImage || shot.productImageUrl, ...item.selectedProductImages].filter((url): url is string => Boolean(url)))].slice(0, 4),
    referenceImage: shot.sourceReferenceImageUrl || '', model: config.selectedImageGenModel,
    aspectRatio: config.selectedAspect, quality: config.selectedQuality, strategy,
    anchorFaceUrl: shot.shot_type === 'pure_product' || shot.shot_type === 'hand_held_only' || shot.has_human === false ? '' : config.anchorFaceUrl || '',
    replacements: [item.applied_scene || '', item.applied_outfit || '', item.applied_persona || ''],
  };
}
