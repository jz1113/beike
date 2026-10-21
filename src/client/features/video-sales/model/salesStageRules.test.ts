import { describe, expect, it } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import { reuseSalesPlanAssets } from './salesAssetHelpers';
import { assertSalesPlanCurrent, invalidateSalesState, salesFinalInputRevision, salesPlanInputRevision, salesSingleVideoError } from './salesStageRules';
import { defaultSalesStudioState, normalizeSalesScripts, readSalesColorSelection, type VideoSalesStudioState } from './salesStudioDraft';
import { salesStageActions } from './salesWorkspaceView';
import { salesResolveRefMode, salesResolveResolution } from './salesWorkspace';

function fixture(): { state: VideoSalesStudioState; script: VideoSalesScript } {
  const state = { ...structuredClone(defaultSalesStudioState), productName: '黑色商品',
    imageCatalog: [{ index: 4, role: 'main' as const, url: '/black.jpg' }],
    colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
  };
  const script: VideoSalesScript = {
    id: 'plan', title: '方案', totalDuration: 15, workflowVersion: 3, deliveryMode: 'single',
    planRevision: salesPlanInputRevision(state), finalizedRevision: 'final', assetValidation: 'passed',
    shots: [{ shotId: 1, type: 'demo', duration: 15, description: '展示', camera: '中景', voiceover: '如实展示', imageIndex: 4, visualSource: 'product_image', transition: 'direct_concat' }],
    assets: [{ id: 'scene', kind: 'scene', label: '桌面', prompt: '实拍桌面', required: true, status: 'done', url: '/scene.jpg', sourceRevision: 'source', validation: 'passed' }],
    seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
    renderStatus: 'generating', renderTaskId: 'paid-task', renderResultUrl: '/history.mp4',
  };
  state.scripts = [script];
  return { state, script };
}

function approvedFixture() {
  const { state, script } = fixture();
  state.selectedChatModel = 'chat';
  state.selectedVideoModel = 'wan3.0-video';
  state.videoResolution = '480P';
  state.videoRefMode = 'omni';
  script.fullPrompt = '图片1黑色卫衣，图片2桌面，整条15秒视频';
  script.shots[0].finalPrompt = '0–15秒展示商品';
  script.finalizedRevision = salesFinalInputRevision(state, script);
  return { state, script };
}

describe('sales stage invalidation and migration', () => {
  it.each<Partial<VideoSalesStudioState>>([
    { productName: '新商品' }, { targetDuration: 30 }, { aspectRatio: '16:9' },
    { colorSelection: { colorLabel: '白色', confirmedImageUrls: ['/white.jpg'], excludedImageUrls: [] } },
  ])('expires dependent plans without losing paid receipts or historical output: %j', (patch) => {
    const { state } = fixture();
    const next = invalidateSalesState(state, patch);
    expect(next.scripts[0]).toMatchObject({ planStale: true, assetValidation: 'pending', renderTaskId: 'paid-task', renderResultUrl: '/history.mp4' });
    expect(next.scripts[0].finalizedRevision).toBeUndefined();
    expect(() => assertSalesPlanCurrent(next, next.scripts[0])).toThrow('更新创作方案');
    expect(state.scripts[0].planStale).toBeUndefined();
  });

  it('keeps the finalized prompt when only the video model changes', () => {
    const { state } = fixture();
    state.selectedVideoModel = 'doubao-seedance-2.5';
    const next = invalidateSalesState(state, { selectedVideoModel: 'wan3.0-video' });
    expect(next.scripts[0].assets).toEqual(state.scripts[0].assets);
    expect(next.scripts[0].planStale).toBeUndefined();
    expect(next.scripts[0].finalizedRevision).toBe('final');
    expect(next.scripts[0].fullPrompt).toBeUndefined();
  });

  it('changes video parameters without requiring a new prompt or deleting images', () => {
    const { state, script } = approvedFixture();
    const next = invalidateSalesState(state, { videoResolution: '1080P' });
    expect(next.scripts[0].assets).toEqual(state.scripts[0].assets);
    expect(next.scripts[0].planStale).toBeUndefined();
    expect(next.scripts[0].fullPrompt).toBe(script.fullPrompt);
    expect(next.scripts[0].shots).toEqual(script.shots);
    expect(next.scripts[0].finalizedRevision).toBe(salesFinalInputRevision(next, next.scripts[0]));
    expect(salesSingleVideoError(next, next.scripts[0], true)).toBeNull();
    expect(assertSalesPlanCurrent(next, next.scripts[0]).map((image) => image.index)).toEqual([4]);
  });

  it('changes the prompt model while preserving the approved prompt and original receipts', () => {
    const { state, script } = approvedFixture();
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat' });
    expect(next.selectedChatModel).toBe('another-chat');
    expect(next.scripts[0].assets).toEqual(state.scripts[0].assets);
    expect(next.scripts[0].planStale).toBeUndefined();
    expect(next.scripts[0].fullPrompt).toBe(script.fullPrompt);
    expect(next.scripts[0].finalizedRevision).toBe(salesFinalInputRevision(next, next.scripts[0]));
    expect(salesSingleVideoError(next, next.scripts[0], true)).toBeNull();
    expect(next.scripts[0].renderTaskId).toBe('paid-task');
  });

  it('keeps legacy video results and receipts while requiring new color evidence and finalization', () => {
    const { script } = fixture();
    const migrated = normalizeSalesScripts([{ ...script, workflowVersion: undefined }], false)[0];
    expect(migrated).toMatchObject({ planStale: true, renderTaskId: 'paid-task', renderResultUrl: '/history.mp4' });
    expect(migrated.finalizedRevision).toBeUndefined();
    expect(readSalesColorSelection(undefined)).toEqual({ colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] });
  });

  it('marks interrupted submissions uncertain and retains receipts for query-only recovery', () => {
    const { script } = fixture();
    const migrated = normalizeSalesScripts([{ ...script, renderTaskId: undefined, assets: [{ ...script.assets![0], status: 'generating', taskId: 'image-receipt' }] }], true)[0];
    expect(migrated.renderStatus).toBe('uncertain');
    expect(migrated.assets![0]).toMatchObject({ status: 'uncertain', taskId: 'image-receipt' });
  });

  it('keeps a finalized prompt when only the video model changes and opens generation', () => {
    const { state, script } = fixture();
    state.selectedChatModel = 'chat';
    state.selectedVideoModel = 'doubao-seedance-2.5';
    state.videoResolution = '720P';
    state.videoRefMode = 'omni';
    script.fullPrompt = '图片1黑色卫衣';
    script.finalizedRevision = salesFinalInputRevision(state, script);
    const next = invalidateSalesState(state, { selectedVideoModel: 'wan3.0-video' });
    expect(next.scripts[0].finalizedRevision).toBe(script.finalizedRevision);
    expect(next.scripts[0].finalizedRevision).toBe(salesFinalInputRevision(next, next.scripts[0]));
    expect(salesSingleVideoError(next, next.scripts[0], true)).toBeNull();
    const actions = salesStageActions({
      step: 'video', busy: false, hasScript: true, planCurrent: true, planReason: null, assetsReady: true,
      assetCount: 1, imageReady: true, finalized: true, videoError: null, submitError: null,
      rendering: false, canQuery: false, hasResult: false, submissionUncertain: false,
    });
    expect(actions.primary.label).toContain('确认生成');
  });

  it('treats resolution letter case as the same video parameter', () => {
    const { state } = fixture();
    state.selectedVideoModel = 'wan3.0-video';
    state.videoResolution = '720P';
    const next = invalidateSalesState(state, { videoResolution: '720p' });
    expect(next.scripts[0].finalizedRevision).toBe('final');
    expect(next.videoResolution).toBe('720p');
  });

  it('keeps the prompt through a model switch and the parameter picker normalization that follows', () => {
    const { state, script } = approvedFixture();
    const switched = invalidateSalesState(state, { selectedVideoModel: 'sora-2' });
    const next = invalidateSalesState(switched, {
      videoResolution: salesResolveResolution(switched.selectedVideoModel, switched.videoResolution),
      videoRefMode: salesResolveRefMode(switched.selectedVideoModel, switched.videoRefMode),
    });
    expect(next.videoRefMode).toBe('first_frame');
    expect(next.scripts[0].fullPrompt).toBe(script.fullPrompt);
    expect(next.scripts[0].shots).toEqual(script.shots);
    expect(next.scripts[0].assets).toEqual(script.assets);
    expect(next.scripts[0].finalizedRevision).toBe(salesFinalInputRevision(next, next.scripts[0]));
    expect(next.scripts[0].finalStaleReason).toBeUndefined();
    const error = salesSingleVideoError(next, next.scripts[0], true);
    expect(error).toBeTruthy();
    expect(error).not.toMatch(/生成视频提示词|定稿/);
    const actions = salesStageActions({
      step: 'video', busy: false, hasScript: true, planCurrent: true, planReason: null, assetsReady: true,
      assetCount: 1, imageReady: true, finalized: true, videoError: error, submitError: error,
      rendering: false, canQuery: false, hasResult: false, submissionUncertain: false,
    });
    expect(actions.primary).toMatchObject({ intent: 'render', disabled: true });
    expect(actions.reason).toBe(error);
  });

  it.each([undefined, 'old-content'])('never approves a missing or outdated prompt on a model switch: %s', (revision) => {
    const { state, script } = approvedFixture();
    script.finalizedRevision = revision;
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat', videoResolution: '1080P' });
    expect(next.scripts[0].finalizedRevision).toBe(revision);
    expect(salesSingleVideoError(next, next.scripts[0], true)).toContain('更新视频提示词');
  });

  it('still expires content changes even when the model changes at the same time', () => {
    const { state } = approvedFixture();
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat', productName: '另一商品' });
    expect(next.scripts[0].planStale).toBe(true);
    expect(next.scripts[0].finalizedRevision).toBeUndefined();
  });

  it('expires the final prompt when narration becomes on-camera speech', () => {
    const { state, script } = approvedFixture();
    script.shots[0].speechMode = 'on_camera';
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat' });
    expect(next.scripts[0].finalizedRevision).not.toBe(salesFinalInputRevision(next, next.scripts[0]));
    expect(salesSingleVideoError(next, next.scripts[0], true)).toContain('更新视频提示词');
    expect(next.scripts[0].renderTaskId).toBe('paid-task');
  });

  it('does not approve an old prompt after the actual script has changed', () => {
    const { state, script } = approvedFixture();
    script.shots[0].voiceover = '已经修改的口播';
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat' });
    expect(next.scripts[0].finalizedRevision).not.toBe(salesFinalInputRevision(next, next.scripts[0]));
  });

  it('keeps the prompt when the chat picker id and upstream model id are the same model', () => {
    const memory = new Map<string, string>();
    configureDomainRuntime({ storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); },
    } });
    try {
      memory.set(getModalityStorageKey('chat'), JSON.stringify([{ id: 'entry-claude', modelId: 'claude-haiku', name: 'Claude' }]));
      const { state } = fixture();
      state.selectedChatModel = 'entry-claude';
      const next = invalidateSalesState(state, { selectedChatModel: 'claude-haiku' });
      expect(next.scripts[0].finalizedRevision).toBe('final');
      expect(next.selectedChatModel).toBe('claude-haiku');
    } finally {
      configureDomainRuntime({ storage: null });
    }
  });

  it('only reuses completed matching assets and always rechecks their actual images', () => {
    const { script } = fixture();
    const next = { ...script, assets: [{ ...script.assets![0], status: 'pending' as const, url: undefined }] };
    expect(reuseSalesPlanAssets(next, script).assets![0]).toMatchObject({ url: '/scene.jpg', status: 'done', validation: 'pending' });
    expect(reuseSalesPlanAssets({ ...next, planRevision: 'new-color' }, script).assets![0].url).toBeUndefined();
    expect(reuseSalesPlanAssets({ ...next, assets: [{ ...next.assets[0], prompt: '另一个场景' }] }, script).assets![0].url).toBeUndefined();
  });
});
