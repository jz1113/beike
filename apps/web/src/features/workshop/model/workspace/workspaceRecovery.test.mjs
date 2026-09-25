import test from 'node:test';
import assert from 'node:assert/strict';
import { isEphemeralResultUrl, recoverWorkspace, shouldArchiveOccupiedBatch, hasWorkspaceContent } from './workspaceRecovery.ts';
import { sanitizeBatchItem } from './snapshotSanitize.ts';

test('blob and oversized data urls are ephemeral', () => {
  assert.equal(isEphemeralResultUrl('blob:http://localhost/abc'), true);
  assert.equal(isEphemeralResultUrl(`data:${'a'.repeat(900)}`), true);
  assert.equal(isEphemeralResultUrl('/storage/images/a.png'), false);
});

test('recovery marks dead success images as retryable failures', () => {
  const recovered = recoverWorkspace({
    version: 2,
    mode: 'original',
    currentStage: 4,
    batchInputText: '',
    settings: {
      selectedVisionModel: 'gemini-3.7-flash',
      selectedImageGenModel: 'gpt-image-2',
      selectedArchId: 'recipe_jewelry_master',
      hasHumanPersona: true,
      personaMode: 'asset_driven',
      selectedQuality: 'high',
      selectedAspect: '3:4',
      selectedShotCount: 4,
      useAssetLibrary: true,
      lockedPersonaId: 'auto',
      lockedSceneId: 'auto',
      lockedOutfitId: 'auto',
      lockedActionId: 'auto',
      lockedFullPromptId: 'auto',
      generationStrategy: 'single_shot',
      autoGenerateCopywriting: true,
    },
    pipeline: { status: 'draft', planRevision: 0, storyboardRevision: 0, diversityContext: { groupSignatures: [], actionIds: [], sceneIds: [] }, runs: [] },
    items: [{
      id: '1', itemId: '1', platform: 'jd', title: '手机', price: 1, category: '', brand: '', coverImage: '',
      mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
      allTypedImages: [], selectedProductImages: [], prompts: [],
      tasks: [
        { id: 't1', shot_no: 1, title: '1', prompt: 'p', status: 'SUCCESS', resultUrl: 'blob:http://local/1', outputReview: 'unreviewed', revision: 0, resultStatus: 'current' },
        { id: 't2', shot_no: 2, title: '2', prompt: 'p', status: 'SUCCESS', resultUrl: '/storage/images/ok.png', outputReview: 'unreviewed', revision: 0, resultStatus: 'current' },
        { id: 't3', shot_no: 3, title: '3', prompt: 'p', status: 'IN_PROGRESS', outputReview: 'unreviewed', revision: 0, resultStatus: 'current' },
      ],
    }],
  });
  assert.equal(recovered.items[0].tasks[0].status, 'FAILURE');
  assert.equal(recovered.items[0].tasks[0].recoveryRequired, false);
  assert.equal(recovered.items[0].tasks[0].error, '图片已失效，请重新生成');
  assert.equal(recovered.items[0].tasks[1].status, 'SUCCESS');
  assert.equal(recovered.items[0].tasks[2].recoveryRequired, true);
});

test('recovery settles an interrupted generating pipeline', () => {
  const recovered = recoverWorkspace({
    version: 2,
    mode: 'original',
    currentStage: 4,
    batchInputText: '',
    settings: {
      selectedVisionModel: 'gemini-3.7-flash',
      selectedImageGenModel: 'gpt-image-2',
      selectedArchId: 'recipe_jewelry_master',
      hasHumanPersona: true,
      personaMode: 'asset_driven',
      selectedQuality: 'high',
      selectedAspect: '3:4',
      selectedShotCount: 4,
      useAssetLibrary: true,
      lockedPersonaId: 'auto',
      lockedSceneId: 'auto',
      lockedOutfitId: 'auto',
      lockedActionId: 'auto',
      lockedFullPromptId: 'auto',
      generationStrategy: 'single_shot',
      autoGenerateCopywriting: true,
    },
    pipeline: { status: 'generating', planRevision: 0, storyboardRevision: 0, diversityContext: { groupSignatures: [], actionIds: [], sceneIds: [] }, runs: [] },
    items: [{
      id: '1', itemId: '1', platform: 'jd', title: '手机', price: 1, category: '', brand: '', coverImage: '',
      mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
      allTypedImages: [], selectedProductImages: [], prompts: [],
      tasks: [
        { id: 't1', shot_no: 1, title: '1', prompt: 'p', status: 'SUCCESS', resultUrl: '', outputReview: 'unreviewed', revision: 0, resultStatus: 'current' },
        { id: 't2', shot_no: 2, title: '2', prompt: 'p', status: 'SUCCESS', resultUrl: '/storage/images/ok.png', outputReview: 'unreviewed', revision: 0, resultStatus: 'current' },
      ],
    }],
  });
  assert.equal(recovered.items[0].tasks[0].status, 'FAILURE');
  assert.equal(recovered.pipeline.status, 'partial_failed');
});

test('snapshot save drops blob result urls', () => {
  const item = sanitizeBatchItem({
    id: '1', itemId: '1', platform: 'jd', title: '手机', price: 1, category: '', brand: '',
    coverImage: 'blob:http://local/cover',
    mainImages: ['https://img.example/a.jpg'], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
    allTypedImages: [], selectedProductImages: [], prompts: [],
    tasks: [{ id: 't1', shot_no: 1, title: '1', prompt: 'p', status: 'SUCCESS', resultUrl: 'blob:http://local/1' }],
  });
  assert.equal(item.coverImage, '');
  assert.equal(item.mainImages[0], 'https://img.example/a.jpg');
  assert.equal(item.tasks[0].resultUrl, undefined);
  assert.equal(item.tasks[0].status, 'FAILURE');
});

test('opening archives only an occupied active batch', () => {
  assert.equal(shouldArchiveOccupiedBatch(4, true), true);
  assert.equal(shouldArchiveOccupiedBatch(0, true), false);
  assert.equal(shouldArchiveOccupiedBatch(4, false), false);
});


test('home entry preserves occupied batches including uncollected input', () => {
  assert.equal(hasWorkspaceContent({ items: [], batchInputText: '  ' }), false);
  assert.equal(hasWorkspaceContent({ items: [], batchInputText: 'https://item.jd.com/123.html' }), true);
  assert.equal(hasWorkspaceContent({ items: [{}], batchInputText: '' }), true);
});
