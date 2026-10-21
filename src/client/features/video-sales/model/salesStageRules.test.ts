import { describe, expect, it } from 'vitest';
import { defaultSalesStudioState, normalizeSalesScripts, readSalesColorSelection, type VideoSalesStudioState } from './salesStudioDraft';
import { assertSalesPlanCurrent, invalidateSalesState, salesPlanInputRevision } from './salesStageRules';
import { reuseSalesPlanAssets } from './salesAssetHelpers';
import type { VideoSalesScript } from '@shared/domain/video-sales';

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

  it('changes video configuration without deleting valid generated images or the plan', () => {
    const { state } = fixture();
    const next = invalidateSalesState(state, { selectedVideoModel: 'another', videoResolution: '1080P' });
    expect(next.scripts[0].assets).toEqual(state.scripts[0].assets);
    expect(next.scripts[0].planStale).toBeUndefined();
    expect(next.scripts[0].finalizedRevision).toBeUndefined();
    expect(assertSalesPlanCurrent(next, next.scripts[0]).map((image) => image.index)).toEqual([4]);
  });

  it('changes the prompt model without staling the plan or deleting images', () => {
    const { state } = fixture();
    const next = invalidateSalesState(state, { selectedChatModel: 'another-chat' });
    expect(next.selectedChatModel).toBe('another-chat');
    expect(next.scripts[0].assets).toEqual(state.scripts[0].assets);
    expect(next.scripts[0].planStale).toBeUndefined();
    expect(next.scripts[0].finalizedRevision).toBeUndefined();
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

  it('only reuses completed matching assets and always rechecks their actual images', () => {
    const { script } = fixture();
    const next = { ...script, assets: [{ ...script.assets![0], status: 'pending' as const, url: undefined }] };
    expect(reuseSalesPlanAssets(next, script).assets![0]).toMatchObject({ url: '/scene.jpg', status: 'done', validation: 'pending' });
    expect(reuseSalesPlanAssets({ ...next, planRevision: 'new-color' }, script).assets![0].url).toBeUndefined();
    expect(reuseSalesPlanAssets({ ...next, assets: [{ ...next.assets[0], prompt: '另一个场景' }] }, script).assets![0].url).toBeUndefined();
  });
});
