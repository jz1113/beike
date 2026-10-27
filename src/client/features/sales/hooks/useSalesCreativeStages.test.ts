import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { useSalesCreativeStages } from './useSalesCreativeStages';
import { analyzeProductMedia, finalizeSalesPrompts } from '../api/videoSalesApi';
import { prepareSalesCreativeAssets } from '../model/prepareSalesAssets';
import { salesPlanInputRevision, salesSingleVideoError } from '../model/salesStageRules';
import { defaultSalesStudioState, type VideoSalesStudioState } from '../model/salesStudioDraft';
import { salesAssetSourceRevision } from '../model/salesAssetHelpers';
import { generateSalesReferenceFrame } from '../api/salesMediaApi';

const resolveModalityModelRoute = vi.hoisted(() => vi.fn((modality: string, value?: string, options?: unknown) => {
  void value;
  void options;
  return {
    modelId: `${modality}-chosen`,
    ...(modality === 'chat' ? { textProtocol: 'openai', baseUrl: 'https://model-channel.test', apiKey: 'model-key' } : {}),
  };
}));

vi.mock('react', () => ({ useCallback: (callback: unknown) => callback, useEffect: () => {}, useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock('../model/prepareSalesAssets', () => ({ prepareSalesCreativeAssets: vi.fn() }));
vi.mock('../api/videoSalesApi', () => ({ analyzeProductMedia: vi.fn(), finalizeSalesPrompts: vi.fn() }));
vi.mock('../api/salesMediaApi', () => ({ generateSalesReferenceFrame: vi.fn() }));
vi.mock('../model/salesStageRules', async (original) => ({ ...await original<typeof import('../model/salesStageRules')>(), salesSingleVideoError: vi.fn() }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ resolveModalityModelRoute }));

function Harness() {
  const state: VideoSalesStudioState = { ...structuredClone(defaultSalesStudioState), productName: '商品',
    imageCatalog: [{ index: 8, role: 'main', url: '/black.jpg' }], colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
  };
  const script: VideoSalesScript = { id: 'plan', title: '脚本', totalDuration: 15, deliveryMode: 'single', workflowVersion: 3, planRevision: salesPlanInputRevision(state),
    assets: [{ id: 'scene', kind: 'scene', label: '桌面', prompt: '实拍桌面', required: true, status: 'pending' }],
    shots: [{ shotId: 1, type: 'demo', duration: 15, imageIndex: 8, description: '展示', camera: '中景', speechMode: 'voiceover', voiceover: '商品', visualSource: 'product_image', transition: 'direct_concat' }],
    seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  };
  state.scripts = [script];
  const stateRef = { current: state };
  const setError = vi.fn();
  const stages = useSalesCreativeStages({ stateRef, busyRef: { current: { collecting: false, planning: false, rendering: false, uploading: false } },
    commit: (recipe) => { stateRef.current = recipe(stateRef.current); }, setError });
  return { stateRef, stages, setError };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesSingleVideoError).mockImplementation((_state, script) => script?.assetValidation === 'passed' ? null : '素材尚未完成校验');
  vi.mocked(finalizeSalesPrompts).mockResolvedValue({ fullPrompt: '实际图片1商品，图片2桌面', prompts: [{ shotId: 1, prompt: '0–15秒展示商品' }] });
});

describe('sales creative stage ordering', () => {
  it('requires selected product images before analysis and never falls back to the gallery', async () => {
    const { stages, stateRef, setError } = Harness();
    stateRef.current.colorSelection = { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] };
    expect(await stages.runProductAnalyze()).toBe(false);
    expect(analyzeProductMedia).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('请先选择至少一张用于生成的商品图');
  });
  it('reuses analysis for unchanged selected product inputs without another model call', async () => {
    const { stages } = Harness();
    vi.mocked(analyzeProductMedia).mockResolvedValue({ sellingPoints: ['圆领结构'] } as NonNullable<VideoSalesStudioState['analysis']>);
    expect(await stages.runProductAnalyze()).toBe(true);
    expect(await stages.runProductAnalyze()).toBe(true);
    expect(analyzeProductMedia).toHaveBeenCalledTimes(1);
  });
  it('invalidates a changed image prompt and prevents confirming the previous image', () => {
    const { stages, stateRef } = Harness();
    const asset = stateRef.current.scripts[0].assets![0];
    Object.assign(asset, { status: 'done', url: '/old.jpg', validation: 'passed' });
    stages.editAssetPrompt('scene', '新的房间');
    expect(stateRef.current.scripts[0].assets![0]).toMatchObject({ prompt: '新的房间', status: 'pending', url: '/old.jpg' });
    expect(stages.confirmAssets()).toBe(false);
  });
  it('preserves the prompt and receipt while an image submission remains unresolved', () => {
    const { stages, stateRef, setError } = Harness();
    Object.assign(stateRef.current.scripts[0].assets![0], { status: 'uncertain', taskId: 'paid-task' });
    stages.editAssetPrompt('scene', '不能替换原任务输入');
    expect(stateRef.current.scripts[0].assets![0]).toMatchObject({ prompt: '实拍桌面', taskId: 'paid-task' });
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('原图片任务'));
  });
  it('rejects confirmation when a recovered dependent image has outdated sources', () => {
    const { stages, stateRef, setError } = Harness();
    const script = stateRef.current.scripts[0];
    const asset = script.assets![0];
    asset.sourceRevision = salesAssetSourceRevision(asset, stateRef.current.imageCatalog, script.assets!, '', '9:16');
    Object.assign(asset, { status: 'done', url: '/old.jpg', prompt: '已修改的场景' });
    expect(stages.confirmAssets()).toBe(false);
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('重新生成此素材'));
  });
  it('does not apply an analysis response after the product inputs change', async () => {
    const { stages, stateRef } = Harness();
    vi.mocked(analyzeProductMedia).mockImplementation(async () => {
      stateRef.current = { ...stateRef.current, productName: '另一个商品' };
      return { sellingPoints: ['旧商品卖点'] } as NonNullable<VideoSalesStudioState['analysis']>;
    });
    expect(await stages.runProductAnalyze()).toBe(false);
    expect(stateRef.current.analysis).toBeNull();
    expect(stateRef.current.sellingPoints).toBe('');
  });

  it('queries only the requested image receipt even after the plan becomes stale', async () => {
    const { stages, stateRef } = Harness();
    const script = stateRef.current.scripts[0];
    script.planStale = true;
    script.assets = [
      { ...script.assets![0], status: 'generating', taskId: 'scene-task' },
      { ...script.assets![0], id: 'other', status: 'generating', taskId: 'other-task' },
    ];
    vi.mocked(generateSalesReferenceFrame).mockResolvedValue('/recovered-scene.jpg');
    await stages.runAssets('scene', true);
    expect(generateSalesReferenceFrame).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ existingTaskId: 'scene-task' }));
    expect(stateRef.current.scripts[0].assets![0]).toMatchObject({ status: 'done', url: '/recovered-scene.jpg' });
    expect(stateRef.current.scripts[0].assets![1].status).toBe('generating');
    expect(prepareSalesCreativeAssets).not.toHaveBeenCalled();
  });
  it('confirms actual pictures manually without a model call and rejects incomplete pictures', () => {
    const { stages, stateRef } = Harness();
    expect(stages.confirmAssets()).toBe(false);
    stateRef.current.scripts[0].assets![0] = { ...stateRef.current.scripts[0].assets![0], status: 'done', url: '/actual.jpg' };
    expect(stages.confirmAssets()).toBe(true);
    expect(stateRef.current.scripts[0]).toMatchObject({ assetValidation: 'passed', assets: [{ validation: 'passed', validationSource: 'manual' }] });
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
    expect(prepareSalesCreativeAssets).not.toHaveBeenCalled();
  });
  it('blocks finalization until actual images pass and sends those exact images in submission order', async () => {
    const { stages, stateRef, setError } = Harness();
    stateRef.current.analysis = { sellingPoints: ['圆领结构'], knownFacts: ['棉含量由原始商品资料提供'] } as NonNullable<VideoSalesStudioState['analysis']>;
    stateRef.current.props = { 材质: '纯棉', 价格: '168元' };
    stateRef.current.sellingPoints = '圆领；价格：168元';
    stateRef.current.scripts[0].planRevision = salesPlanInputRevision(stateRef.current);
    await stages.runFinalize();
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('素材尚未完成校验');
    vi.mocked(prepareSalesCreativeAssets).mockImplementation(async (input) => {
      input.updateAsset('scene', { url: '/actual-scene.jpg', status: 'done', validation: 'passed' });
    });
    await stages.runAssets();
    expect(stateRef.current.scripts[0].fullPrompt).toBeUndefined();
    expect(stages.confirmAssets()).toBe(true);
    await stages.runFinalize();
    expect(finalizeSalesPrompts).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ operation: 'finalize',
      model: 'chat-chosen', textProtocol: 'openai', customBaseUrl: 'https://model-channel.test', customApiKey: 'model-key',
      productAnalysis: JSON.stringify(stateRef.current.analysis),
      productDescription: JSON.stringify({ originalProductProperties: { 材质: '纯棉' }, creativeSellingPoints: '圆领' }),
      actualReferences: [{ id: 'product-8', kind: 'product', label: '商品参考 9', url: '/black.jpg' }, { id: 'scene', kind: 'scene', label: '桌面', url: '/actual-scene.jpg' }],
    }));
    expect(resolveModalityModelRoute).toHaveBeenCalledWith('chat', undefined);
    expect(resolveModalityModelRoute.mock.calls.filter(([modality]) => modality === 'chat').every(([, , options]) => options === undefined)).toBe(true);
    expect(stateRef.current.scripts[0].finalizedRevision).toBeTruthy();
  });

  it('retries a rejected reference and still blocks an unknown submission', async () => {
    const { stages, stateRef, setError } = Harness();
    stateRef.current.scripts[0].assets![0] = { ...stateRef.current.scripts[0].assets![0], status: 'uncertain', error: '图 2 缺失参考图无法读取；参考图预设 SM19' };
    await stages.runAssets('scene');
    expect(prepareSalesCreativeAssets).toHaveBeenCalledWith(expect.objectContaining({ regenerateId: 'scene' }), expect.anything());
    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining('未确认'));
    vi.mocked(prepareSalesCreativeAssets).mockClear();
    stateRef.current.scripts[0].assets![0] = { ...stateRef.current.scripts[0].assets![0], status: 'uncertain', taskId: undefined, error: '连接中断' };
    await stages.runAssets('scene');
    expect(prepareSalesCreativeAssets).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('未确认'));
  });

  it('rejects a stale finalization response after inputs change', async () => {
    const { stages, stateRef } = Harness();
    stateRef.current.scripts[0].assetValidation = 'passed';
    stateRef.current.scripts[0].assets![0] = { ...stateRef.current.scripts[0].assets![0], url: '/scene.jpg', status: 'done', validation: 'passed' };
    vi.mocked(finalizeSalesPrompts).mockImplementation(async () => {
      stateRef.current = { ...stateRef.current, targetDuration: 30 };
      return { fullPrompt: '旧15秒定稿', prompts: [{ shotId: 1, prompt: '旧时间轴' }] };
    });
    await stages.runFinalize();
    expect(stateRef.current.scripts[0].fullPrompt).toBeUndefined();
  });
});
