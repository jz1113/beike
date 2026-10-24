import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { useSalesCreativeStages } from './useSalesCreativeStages';
import { finalizeSalesPrompts } from '../api/videoSalesApi';
import { prepareSalesCreativeAssets } from '../model/prepareSalesAssets';
import { salesPlanInputRevision, salesSingleVideoError } from '../model/salesStageRules';
import { defaultSalesStudioState, type VideoSalesStudioState } from '../model/salesStudioDraft';
import { generateSalesReferenceFrame } from '../api/salesMediaApi';

vi.mock('react', () => ({ useCallback: (callback: unknown) => callback, useEffect: () => {}, useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock('../model/prepareSalesAssets', () => ({ prepareSalesCreativeAssets: vi.fn() }));
vi.mock('../api/videoSalesApi', () => ({ analyzeProductMedia: vi.fn(), finalizeSalesPrompts: vi.fn(), validateSalesAssets: vi.fn() }));
vi.mock('../api/salesMediaApi', () => ({ generateSalesReferenceFrame: vi.fn() }));
vi.mock('../model/salesStageRules', async (original) => ({ ...await original<typeof import('../model/salesStageRules')>(), salesSingleVideoError: vi.fn() }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ resolveModalityModelRoute: (modality: string) => ({ modelId: `${modality}-chosen` }) }));

function Harness() {
  const state: VideoSalesStudioState = { ...structuredClone(defaultSalesStudioState), productName: '商品',
    imageCatalog: [{ index: 8, role: 'main', url: '/black.jpg' }], colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
  };
  const script: VideoSalesScript = { id: 'plan', title: '脚本', totalDuration: 15, deliveryMode: 'single', workflowVersion: 3, planRevision: salesPlanInputRevision(state),
    assets: [{ id: 'scene', kind: 'scene', label: '桌面', prompt: '实拍桌面', required: true, status: 'pending' }],
    shots: [{ shotId: 1, type: 'demo', duration: 15, imageIndex: 8, description: '展示', camera: '中景', voiceover: '商品', visualSource: 'product_image', transition: 'direct_concat' }],
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
    await stages.runFinalize();
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('素材尚未完成校验');
    vi.mocked(prepareSalesCreativeAssets).mockImplementation(async (input) => {
      input.updateAsset('scene', { url: '/actual-scene.jpg', status: 'done', validation: 'passed' });
      input.setValidation('passed');
    });
    await stages.runAssets();
    expect(stateRef.current.scripts[0].fullPrompt).toBeUndefined();
    await stages.runFinalize();
    expect(finalizeSalesPrompts).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ operation: 'finalize',
      actualReferences: [{ id: 'product-8', kind: 'product', label: '商品参考 9', url: '/black.jpg' }, { id: 'scene', kind: 'scene', label: '桌面', url: '/actual-scene.jpg' }],
    }));
    expect(stateRef.current.scripts[0].finalizedRevision).toBeTruthy();
  });

  it('retries a rejected reference and still blocks an unknown submission', async () => {
    const { stages, stateRef, setError } = Harness();
    stateRef.current.scripts[0].assets![0] = { ...stateRef.current.scripts[0].assets![0], status: 'uncertain', error: '图 2 缺失参考图无法读取；参考图预设 SM19' };
    await stages.runAssets('scene');
    expect(prepareSalesCreativeAssets).toHaveBeenCalledWith(expect.objectContaining({ regenerateId: 'scene' }), expect.anything(), expect.anything());
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
