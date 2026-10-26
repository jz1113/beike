import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eligibleSalesImages, salesActualReferences, type VideoSalesScript } from '@shared/domain/sales';
import { analyzeProductMedia, finalizeSalesPrompts, generateSalesScripts, selectSalesImages } from '../api/videoSalesApi';
import { buildSalesPlan } from './buildSalesPlan';
import { executeSalesRender } from './executeSalesRender';
import { SalesSubmitUncertainError } from '../api/salesMediaApi';
import { mapCollectedSalesProduct } from './productLink';
import { prepareSalesCreativeAssets } from './prepareSalesAssets';
import { renderSalesVideo } from './renderSalesVideo';
import { generateSalesShotVideo } from '../api/salesMediaApi';
import { invalidateSalesState, salesFinalInputRevision, salesPlanInputRevision } from './salesStageRules';
import { readSalesStudioDraft, SALES_STUDIO_STORAGE_KEY, type VideoSalesStudioState } from './salesStudioDraft';
import { salesSingleVideoError } from './salesStageRules';
import type { SalesImageBatchItem } from '../api/salesImageBatch';

vi.mock('../api/videoSalesApi', () => ({
  analyzeProductMedia: vi.fn(), generateSalesScripts: vi.fn(), selectSalesImages: vi.fn(), finalizeSalesPrompts: vi.fn(),
}));
vi.mock('./renderSalesVideo', () => ({ renderSalesVideo: vi.fn() }));
vi.mock('../api/salesMediaApi', async (original) => ({ ...await original<typeof import('../api/salesMediaApi')>(), generateSalesShotVideo: vi.fn() }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ resolveModalityModelRoute: (_modality: string, modelId: string) => ({ modelId }) }));

const planApi = { analyzeProductMedia, generateSalesScripts, selectSalesImages };
const renderApi = { generateVideo: generateSalesShotVideo };
const seo = { title: '', hashtags: [] as string[], coverText: '', interactionGuide: '', description: '' };
const analysis = {
  productName: '黑色圆领上衣', category: 'fashion' as const,
  visualFeatures: { mainColor: '黑色', designStyle: '圆领', productForm: '上衣', texture: '棉' },
  sellingPoints: ['圆领'], targetAudience: '成年人', usageScenarios: ['日常'], painPoints: [],
  videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' },
};
const shot = { shotId: 1, type: 'demo' as const, duration: 15, description: '展示黑色上衣', camera: '中景', speechMode: 'voiceover' as const, voiceover: '看这件黑色上衣', visualSource: 'product_image' as const, transition: 'direct_concat' as const };

function fashionState(): VideoSalesStudioState {
  const fillers = Array.from({ length: 7 }, (_, index) => `https://example.com/other-${index}.jpg`);
  const product = mapCollectedSalesProduct({ product: {
    title: '黑色圆领上衣', category: '女装', brand: '示例', price: 99,
    mainImages: [...fillers, 'https://example.com/black.jpg'],
    skuImages: ['https://example.com/white.jpg'],
    variantMetadata: { version: 1, variants: [
      { id: 'black', label: '黑色', color: '黑色', skuIds: ['1'], imageUrls: ['https://example.com/black.jpg'] },
      { id: 'white', label: '白色', color: '白色', skuIds: ['2'], imageUrls: ['https://example.com/white.jpg'] },
    ] },
  } }, 'https://item.jd.com/1.html');
  return {
    ...product, draftVersion: 3, category: 'fashion', sellingPoints: '圆领', props: product.props,
    colorSelection: { variantId: 'black', colorLabel: '黑色', confirmedImageUrls: [], excludedImageUrls: [] }, videoMode: 'product_closeup', targetDuration: 15,
    aspectRatio: '9:16', videoResolution: '720P', videoRefMode: 'omni',
    selectedChatModel: 'vision-test', selectedImageModel: 'image-test', selectedVideoModel: 'kling-video-v3-omni',
    scripts: [], selectedScriptIndex: 0, analysis: null, composedResultUrl: null,
  };
}

async function readyFashion() {
  const state = fashionState();
  const images = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const phases: string[] = [];
  const plan = await buildSalesPlan({
    productName: state.productName, brand: state.brand, category: 'fashion', sellingPoints: state.sellingPoints,
    imageCatalog: images, selectedColor: '黑色', aspectRatio: state.aspectRatio,
    targetDuration: 15, videoMode: state.videoMode, route: { model: 'vision-test' }, onPhase: (phase) => phases.push(phase),
  }, planApi);
  let script: VideoSalesScript = { ...plan.script, id: 'plan', planRevision: salesPlanInputRevision(state) };
  const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const })));
  await prepareSalesCreativeAssets({
    script, images, imageModel: 'image-test', aspectRatio: '9:16', selectedColor: '黑色',
    isAborted: () => false, getScript: () => script,
    updateAsset: (id, patch) => { script = { ...script, assets: script.assets!.map((asset) => asset.id === id ? { ...asset, ...patch } : asset) }; },
  }, { submitBatch, poll: async () => { throw new Error('不应查询'); }, lookup: async () => ({ id: '', outcome: 'uncertain' }) });
  script = { ...script, assets: script.assets?.map((asset) => ({ ...asset, validation: 'passed' as const, validationSource: 'manual' as const })), assetValidation: 'passed' };
  const references = salesActualReferences(script, images);
  const finalized = await finalizeSalesPrompts({ workflowVersion: 3, category: 'fashion', shots: script.shots, assets: script.assets!, targetDuration: state.targetDuration, aspectRatio: state.aspectRatio, eligibleImageIndexes: images.map((image) => image.index), imageCatalog: images, actualReferences: references, operation: 'finalize' });
  script = {
    ...script, fullPrompt: finalized.fullPrompt, assetValidation: 'passed',
    shots: script.shots.map((item) => ({ ...item, finalPrompt: finalized.prompts.find((prompt) => prompt.shotId === item.shotId)?.prompt, promptStale: false })),
  };
  script = { ...script, finalizedRevision: salesFinalInputRevision(state, script) };
  state.analysis = plan.analysis;
  state.scripts = [script];
  return { state, get script() { return script; }, setScript: (next: VideoSalesScript) => { script = next; }, phases, images, references, submitBatch };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', () => Promise.reject(new Error('模拟流程禁止真实网络请求')));
  vi.mocked(analyzeProductMedia).mockResolvedValue(analysis);
  vi.mocked(generateSalesScripts).mockResolvedValue([{
    id: 'draft', title: '开箱', totalDuration: 15, beat: 'unbox', shots: [shot], seo,
    assets: [
      { id: 'person', kind: 'person', label: '出镜人物', prompt: '成年人物上身展示黑色上衣', required: true },
      { id: 'face', kind: 'face', label: '人物特写', prompt: '同一人物面部特写', required: true, referenceAssetIds: ['person'] },
    ],
  }]);
  vi.mocked(selectSalesImages).mockResolvedValue([{ shotId: 1, imageIndex: 7, reason: '黑色主图' }]);
  vi.mocked(finalizeSalesPrompts).mockResolvedValue({ fullPrompt: '图片1黑色上衣，图片2出镜人物，图片3人物特写', prompts: [{ shotId: 1, prompt: '0到15秒展示黑色上衣' }] });
});
afterEach(() => vi.unstubAllGlobals());

describe('offline video sales workflow', () => {
  it('keeps the selected color through planning, dependent images, one video submission and draft restore', async () => {
    const ready = await readyFashion();
    expect(ready.phases).toEqual(['analyze', 'script', 'select']);
    expect(ready.images.map((image) => image.url)).toEqual(['https://example.com/black.jpg']);
    expect(analyzeProductMedia).toHaveBeenCalledWith(expect.objectContaining({ selectedColor: '黑色', eligibleImageIndexes: [7], imageCatalog: ready.images }));
    expect(generateSalesScripts).toHaveBeenCalledWith(expect.objectContaining({ category: 'fashion', selectedColor: '黑色' }));
    expect(selectSalesImages).not.toHaveBeenCalled();
    expect(finalizeSalesPrompts).not.toHaveBeenCalledWith(expect.objectContaining({ imageCatalog: expect.arrayContaining([expect.objectContaining({ url: 'https://example.com/white.jpg' })]) }));
    expect(ready.references.map((ref) => ref.url)).toEqual(['https://example.com/black.jpg', '/person.jpg', '/face.jpg']);
    expect(ready.submitBatch.mock.calls.map((call) => call[0].map((item) => item.id))).toEqual([['person'], ['face']]);
    expect(salesSingleVideoError(ready.state, ready.script, true)).toBeNull();
    const submitted = vi.fn();
    vi.mocked(renderSalesVideo).mockImplementation(async (request) => { submitted(request.single?.images); request.single?.onTaskId?.('paid-once'); return '/final.mp4'; });
    let script = ready.script;
    await executeSalesRender({
      resumeOnly: false, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      onPhase: vi.fn(), onResult: vi.fn(),
      commitScript: (recipe) => { script = recipe(script); ready.setScript(script); ready.state.scripts = [script]; },
    }, renderApi);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledWith(['https://example.com/black.jpg', '/person.jpg', '/face.jpg']);
    expect(script).toMatchObject({ renderTaskId: 'paid-once', renderStatus: 'done', renderResultUrl: '/final.mp4' });
    const storage = new Map<string, string>([[SALES_STUDIO_STORAGE_KEY, JSON.stringify({ ...ready.state, scripts: [script], composedResultUrl: '/final.mp4' })]]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: () => undefined, removeItem: () => undefined } });
    expect(readSalesStudioDraft().scripts[0]).toMatchObject({ renderTaskId: 'paid-once', renderResultUrl: '/final.mp4', assetValidation: 'passed' });
  });

  it('rejects an unsupported category before any model call', async () => {
    await expect(buildSalesPlan({
      productName: '纸巾', brand: '', category: 'other', sellingPoints: '', selectedColor: '白色',
      imageCatalog: [{ index: 0, role: 'main', url: '/white.jpg' }],
      targetDuration: 15, videoMode: 'product_closeup', route: { model: 'vision-test' }, onPhase: vi.fn(),
    }, planApi)).rejects.toThrow('服饰');
    expect(analyzeProductMedia).not.toHaveBeenCalled();
    expect(generateSalesScripts).not.toHaveBeenCalled();
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
  });

  it('blocks finalization after a visual conflict, a stale color and an unknown submission', async () => {
    const ready = await readyFashion();
    ready.setScript({ ...ready.script, assetValidation: 'conflict' });
    ready.state.scripts = [ready.script];
    expect(salesSingleVideoError(ready.state, ready.script, true)).toContain('确认图片');
    const stale = invalidateSalesState(ready.state, { colorSelection: { variantId: 'white', colorLabel: '白色', confirmedImageUrls: [], excludedImageUrls: [] } });
    await expect(executeSalesRender({
      resumeOnly: false, signal: new AbortController().signal, script: ready.script, current: stale, getState: () => stale,
      commitScript: vi.fn(), onPhase: vi.fn(), onResult: vi.fn(),
    }, renderApi)).rejects.toThrow('更新创作方案');
    ready.setScript({ ...ready.script, assetValidation: 'passed', renderStatus: 'uncertain', renderTaskId: undefined });
    expect(salesSingleVideoError(ready.state, ready.script, true)).toContain('核对生成记录');
    expect(renderSalesVideo).not.toHaveBeenCalled();
  });

  it('queries an existing video receipt with its snapshot after the draft changes', async () => {
    const ready = await readyFashion();
    const script = { ...ready.script, renderTaskId: 'original-task', renderStatus: 'uncertain' as const, renderSnapshot: { model: 'original-model', prompt: '原文', images: ['/old.jpg'], duration: 15, aspectRatio: '9:16' as const, resolution: '720P', refMode: 'omni' as const } };
    ready.state.selectedVideoModel = 'changed-model';
    vi.mocked(generateSalesShotVideo).mockResolvedValue('/original.mp4');
    await executeSalesRender({
      resumeOnly: true, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      commitScript: vi.fn(), onPhase: vi.fn(), onResult: vi.fn(),
    }, renderApi);
    expect(generateSalesShotVideo).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'original-task', videoModel: 'original-model' }));
    expect(renderSalesVideo).not.toHaveBeenCalled();
  });

  it('keeps a receipt when rendering is stopped and does not create another task', async () => {
    const ready = await readyFashion();
    let script = ready.script;
    vi.mocked(renderSalesVideo).mockImplementation(async (request) => { request.single?.onTaskId?.('stopped-task'); throw new DOMException('已停止', 'AbortError'); });
    await expect(executeSalesRender({
      resumeOnly: false, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      onPhase: vi.fn(), onResult: vi.fn(),
      commitScript: (recipe) => { script = recipe(script); },
    }, renderApi)).rejects.toThrow('已停止');
    expect(script).toMatchObject({ renderTaskId: 'stopped-task', renderStatus: 'generating' });
    vi.mocked(generateSalesShotVideo).mockResolvedValue('/stopped.mp4');
    await executeSalesRender({
      resumeOnly: true, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      commitScript: vi.fn(), onPhase: vi.fn(), onResult: vi.fn(),
    }, renderApi);
    expect(renderSalesVideo).toHaveBeenCalledTimes(1);
    expect(generateSalesShotVideo).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'stopped-task' }));
  });

  it('does not retry a video submission that returned no receipt', async () => {
    const ready = await readyFashion();
    let script = ready.script;
    vi.mocked(renderSalesVideo).mockRejectedValue(new SalesSubmitUncertainError('回执未确认'));
    await expect(executeSalesRender({
      resumeOnly: false, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      onPhase: vi.fn(), onResult: vi.fn(),
      commitScript: (recipe) => { script = recipe(script); },
    }, renderApi)).rejects.toThrow('回执未确认');
    expect(script.renderStatus).toBe('uncertain');
    expect(script.renderTaskId).toBeUndefined();
    expect(script.renderSubmissionKey).toBeTruthy();
    const lookup = vi.fn(async () => ({ outcome: 'pending' as const, error: '原视频提交结果待核实，请稍后查询；不会自动重新提交' }));
    await expect(executeSalesRender({
      resumeOnly: true, signal: new AbortController().signal, script, current: ready.state, getState: () => ready.state,
      commitScript: (recipe) => { script = recipe(script); }, onPhase: vi.fn(), onResult: vi.fn(),
    }, { ...renderApi, lookupSubmission: lookup })).rejects.toThrow('待核实');
    expect(lookup).toHaveBeenCalledWith(script.renderSubmissionKey, expect.any(String), expect.any(Function));
    expect(renderSalesVideo).toHaveBeenCalledTimes(1);
  });
});
