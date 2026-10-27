import { describe, expect, it } from 'vitest';
import { captureLearningContext } from './learningContext';
import { learningContextSchema } from '@shared/contracts/categorySkills';
import { workshopSnapshotSchema } from '@shared/contracts/workshopWorkspace';
import { prepareTaskRetry } from './generationHelpers';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import type { LearningTaskConfig } from './learningContext';

describe('learning generation evidence', () => {
  it('records skill results without a mother group, replacement assets or a face anchor', () => {
    const item = { appliedSkillSnapshot: { id: 'base', name: 'base', promptSnippet: 'rules', learningScopeId: 'folder', learningVersionId: 'trial', learningReferenceFingerprint: 'skill-only', baseRecipeVersion: 'base' }, selectedProductImages: ['main', 'back'], applied_persona: 'old-persona', applied_outfit: 'old-outfit', applied_scene: 'old-scene' } as BatchProductItem;
    const config = { selectedImageGenModel: 'image', selectedQuality: 'high', selectedAspect: '3:4', anchorFaceUrl: 'old-face', productReferenceImages: ['main'] } satisfies LearningTaskConfig;
    const context = captureLearningContext(item, { shot_no: 1, prompt: '人物展示', assembly_source: 'skill', has_human: true }, config, 'grid_first');
    expect(learningContextSchema.parse(context)).toMatchObject({ groupId: 'skill:folder', versionId: 'trial', referenceImage: '', anchorFaceUrl: '', replacements: [], productImages: ['main'] });
  });
  it('freezes the exact skill, source and product inputs and clears ratings for a new attempt', () => {
    const item = { appliedFullPromptId: 'group', appliedSkillSnapshot: { id: 'base', name: 'base', promptSnippet: 'rules', learningScopeId: 'folder', learningVersionId: 'candidate', learningReferenceFingerprint: 'four-originals', baseRecipeVersion: 'base' }, selectedProductImages: ['main', 'back', 'main'], coverImage: 'cover' } as BatchProductItem;
    const config = { selectedImageGenModel: 'image', selectedQuality: 'high', selectedAspect: '3:4', anchorFaceUrl: 'face' } satisfies LearningTaskConfig;
    const context = captureLearningContext(item, { shot_no: 1, prompt: 'frame', shot_type: 'hand_held_only', sourceReferenceImageUrl: 'source' }, config, 'single_shot');
    expect(learningContextSchema.parse(context).productImages).toEqual(['main', 'back']);
    expect(context?.anchorFaceUrl).toBe('');
    item.appliedSkillSnapshot!.learningVersionId = 'future'; item.selectedProductImages.push('future-product');
    expect(context?.versionId).toBe('candidate'); expect(context?.productImages).toEqual(['main', 'back']);
    const original = { id: 'task', shot_no: 1, title: 'frame', prompt: 'frame', status: 'SUCCESS', resultUrl: 'result', learningContext: context, outputReview: 'accepted', outputRating: { scores: { productFidelity: 90, composition: 90, aesthetic: 90, consistency: 90 } } } satisfies BatchTaskItem;
    const retry = prepareTaskRetry(original);
    expect(retry.learningContext).toBeUndefined(); expect(retry.outputRating).toBeUndefined();
    expect(original.learningContext?.versionId).toBe('candidate');
  });
  it('keeps generation evidence when the workspace is parsed for autosave and restore', () => {
    const context = { scopeId: 'folder', versionId: '', referenceFingerprint: 'refs', baseRecipeVersion: 'base', groupId: 'group', productImages: ['product'], referenceImage: 'original', model: 'image', aspectRatio: '3:4', quality: 'high', strategy: 'single_shot', anchorFaceUrl: '', replacements: ['', '', ''] };
    const snapshot = workshopSnapshotSchema.parse({ version: 1, mode: 'original', currentStage: 4, batchInputText: '', items: [{ id: 'p', itemId: 'sku', platform: 'jd', title: 'product', price: 0, category: '', brand: '', coverImage: '', mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true, allTypedImages: [], selectedProductImages: [], prompts: [], tasks: [{ id: 't', shot_no: 1, title: 'frame', prompt: 'prompt', status: 'SUCCESS', learningContext: context }] }], settings: { selectedVisionModel: 'vision', selectedImageGenModel: 'image', selectedArchId: 'auto', selectedQuality: 'high', selectedAspect: '3:4', selectedShotCount: 4, useAssetLibrary: true, lockedPersonaId: 'auto', lockedSceneId: 'auto', lockedOutfitId: 'auto', lockedActionId: 'auto', generationStrategy: 'single_shot' } });
    expect(snapshot.items[0].tasks[0].learningContext).toEqual(context);
  });
});
