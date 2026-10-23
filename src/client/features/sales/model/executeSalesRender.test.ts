import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { executeSalesRender } from './executeSalesRender';
import { generateSalesShotVideo, SalesSubmitUncertainError } from '../api/salesMediaApi';
import { renderSalesVideo } from './renderSalesVideo';
import { defaultSalesStudioState } from './salesStudioDraft';
import { salesPlanInputRevision, salesSingleVideoError } from './salesStageRules';

vi.mock('../api/salesMediaApi', async (original) => ({ ...await original<typeof import('../api/salesMediaApi')>(), generateSalesShotVideo: vi.fn() }));
vi.mock('./renderSalesVideo', () => ({ renderSalesVideo: vi.fn() }));
vi.mock('./salesStageRules', async (original) => ({ ...await original<typeof import('./salesStageRules')>(), salesSingleVideoError: vi.fn(() => null) }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ resolveModalityModelRoute: (_: string, modelId: string) => ({ modelId }) }));

function fixture() {
  const state = { ...structuredClone(defaultSalesStudioState), productName: '商品', selectedVideoModel: 'chosen-video',
    imageCatalog: [{ index: 7, role: 'main' as const, url: '/product.jpg' }], productImages: ['/product.jpg'],
    colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
  };
  let script: VideoSalesScript = {
    id: 'plan', title: '整段', totalDuration: 15, workflowVersion: 3, deliveryMode: 'single',
    planRevision: salesPlanInputRevision(state), fullPrompt: '实际图片1商品，图片2桌面',
    shots: [{ shotId: 1, type: 'demo', duration: 15, description: '展示', camera: '特写', voiceover: '商品', imageIndex: 7, visualSource: 'product_image', transition: 'direct_concat' }],
    assets: [{ id: 'scene', kind: 'scene', label: '桌面', prompt: '桌面', required: true, url: '/scene.jpg', status: 'done', validation: 'passed' }], assetValidation: 'passed',
    seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  };
  const input: Parameters<typeof executeSalesRender>[0] = {
    script, current: state, resumeOnly: false, signal: new AbortController().signal,
    getState: () => ({ ...state, scripts: [script] }), replaceScript: vi.fn(), patchShot: vi.fn(),
    commitScript: (recipe) => { script = recipe(script); }, onPhase: vi.fn(), onPromptPhase: vi.fn(), onResult: vi.fn(),
  };
  return { input, getScript: () => script };
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(salesSingleVideoError).mockReturnValue(null); });

describe('single sales video submission protection', () => {
  it('submits exactly once with the actual ordered images and stores the receipt and snapshot', async () => {
    const { input, getScript } = fixture();
    vi.mocked(renderSalesVideo).mockImplementation(async (request) => { request.single!.onTaskId!('paid-once'); return '/final.mp4'; });
    await executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' });
    expect(renderSalesVideo).toHaveBeenCalledTimes(1);
    expect(renderSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ single: expect.objectContaining({ images: ['/product.jpg', '/scene.jpg'], duration: 15 }), refMode: input.current.videoRefMode }), expect.anything());
    expect(getScript()).toMatchObject({ renderTaskId: 'paid-once', renderStatus: 'done', renderResultUrl: '/final.mp4', renderSnapshot: { model: 'chosen-video', images: ['/product.jpg', '/scene.jpg'] } });
    expect(getScript().renderSubmissionKey).toBeTruthy();
    expect(renderSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ single: expect.objectContaining({ submissionKey: getScript().renderSubmissionKey }) }), expect.anything());
    expect(input.onPromptPhase).not.toHaveBeenCalled();
  });

  it('blocks an incompatible or stale configuration before any submission', async () => {
    const { input } = fixture();
    vi.mocked(salesSingleVideoError).mockReturnValue('模型不支持所需参考图');
    await expect(executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' })).rejects.toThrow('参考图');
    expect(renderSalesVideo).not.toHaveBeenCalled();
    expect(generateSalesShotVideo).not.toHaveBeenCalled();
  });

  it('keeps an unknown no-receipt submission blocked rather than retrying', async () => {
    const { input, getScript } = fixture();
    vi.mocked(renderSalesVideo).mockRejectedValue(new SalesSubmitUncertainError('回执未确认'));
    await expect(executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' })).rejects.toThrow('回执未确认');
    expect(getScript().renderStatus).toBe('uncertain');
    expect(getScript().renderSnapshot?.model).toBe('chosen-video');
    expect(renderSalesVideo).toHaveBeenCalledTimes(1);
  });

  it('queries an existing receipt using its original model despite current draft edits', async () => {
    const { input, getScript } = fixture();
    input.script.renderTaskId = 'original-task'; input.script.renderStatus = 'uncertain';
    input.script.renderSnapshot = { model: 'original-model', prompt: '原文', images: ['/old.jpg'], duration: 30, aspectRatio: '16:9', resolution: '720P', refMode: 'omni' };
    input.current.selectedVideoModel = 'changed-model'; input.current.colorSelection.colorLabel = '白色';
    vi.mocked(salesSingleVideoError).mockReturnValue('当前方案已过期');
    vi.mocked(generateSalesShotVideo).mockResolvedValue('/original.mp4');
    await executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' });
    expect(generateSalesShotVideo).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'original-task', videoModel: 'original-model', duration: 30 }));
    expect(renderSalesVideo).not.toHaveBeenCalled();
    expect(getScript()).toMatchObject({ renderStatus: 'done', renderResultUrl: '/original.mp4' });
  });

  it('recovers a lost response from its saved submission key and does not create another task', async () => {
    const { input, getScript } = fixture();
    input.script.renderStatus = 'uncertain';
    input.script.renderSubmissionKey = 'saved-key';
    input.script.renderSnapshot = { model: 'original-model', prompt: '原文', images: ['/old.jpg'], duration: 15, aspectRatio: '9:16', resolution: '720P', refMode: 'omni', submissionKey: 'saved-key' };
    const lookup = vi.fn(async () => ({ outcome: 'poll' as const, taskId: 'recovered-task' }));
    vi.mocked(generateSalesShotVideo).mockResolvedValue('/recovered.mp4');
    await executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, lookupSubmission: lookup, compose: async () => '' });
    expect(lookup).toHaveBeenCalledWith('saved-key', 'original-model', expect.any(Function));
    expect(generateSalesShotVideo).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'recovered-task', videoModel: 'original-model' }));
    expect(renderSalesVideo).not.toHaveBeenCalled();
    expect(getScript()).toMatchObject({ renderTaskId: 'recovered-task', renderStatus: 'done', renderResultUrl: '/recovered.mp4' });
  });

  it('stops before submission when the project cannot be saved', async () => {
    const { input, getScript } = fixture();
    input.persistScript = () => { throw new Error('当前项目没有保存成功，已停止提交，避免刷新后重复计费'); };
    await expect(executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' })).rejects.toThrow('没有保存成功');
    expect(renderSalesVideo).not.toHaveBeenCalled();
    expect(getScript().renderStatus).toBeUndefined();
  });

  it('records terminal original-task failures without creating another paid task', async () => {
    const { input, getScript } = fixture();
    input.script.renderTaskId = 'failed-task'; input.script.renderStatus = 'generating';
    vi.mocked(generateSalesShotVideo).mockRejectedValue(Object.assign(new Error('服务商拒绝'), { name: 'ImageGenBusinessError' }));
    await expect(executeSalesRender(input, { generateFrame: async () => '', generateVideo: generateSalesShotVideo, compose: async () => '' })).rejects.toThrow('服务商拒绝');
    expect(getScript()).toMatchObject({ renderTaskId: 'failed-task', renderStatus: 'failed' });
    expect(renderSalesVideo).not.toHaveBeenCalled();
  });
});
