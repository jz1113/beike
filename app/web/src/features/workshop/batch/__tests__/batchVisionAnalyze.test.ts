import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchProductItem } from '../batchTypes';
import type { VisionAnalyzeDeps } from '../batchVisionAnalyze';
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/gatewayClient', () => ({ getGatewayClientOverrides: () => ({}) }));
vi.mock('@/lib/usageTracker', () => ({ recordModelUsage: vi.fn(), resolveModelVendor: () => 'test' }));
import { analyzeBatchProduct } from '../batchVisionAnalyze';

const item = {
  id: 'phone-1', title: '荣耀300 手机', props: {}, coverImage: 'https://example.com/phone.jpg',
  selectedProductImages: ['https://example.com/phone.jpg'], selectedReferenceImages: [], availableReferenceImages: [],
} as unknown as BatchProductItem;
const baseDeps = {
  recipes: [{ id: 'original', name: '自然生活拍摄' }], selectedArchId: 'original', batchMode: 'original',
  hasHumanPersona: true, lockedPersonaId: 'auto', lockedSceneId: 'auto', lockedOutfitId: 'auto', lockedActionId: 'auto',
  selectedShotCount: 4, selectedVisionModel: 'test', availableScenes: [],
} satisfies VisionAnalyzeDeps;

beforeEach(() => vi.clearAllMocks());
describe('batch storyboard response handling', () => {
  it('rejects an incomplete original storyboard instead of fabricating fixed fallback poses', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ prompts: [{ title: '窗边持机', action: '双手自然持机' }] }) });
    let state = [{ ...item, analyzedSuccess: true, prompts: [{ title: 'old' }] }] as BatchProductItem[];
    const setItems: VisionAnalyzeDeps['setItems'] = update => { state = typeof update === 'function' ? update(state) : update; };
    await expect(analyzeBatchProduct({ ...baseDeps, setItems }, item)).rejects.toThrow('仅返回 1 个分镜，需要 4 个');
    expect(state[0].analyzedSuccess).toBe(false);
    expect(state[0].prompts).toEqual([]);
    expect(state[0].analysisError).toContain('重新分析');
  });

  it('does not send the default jewelry master recipe for a phone', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'stop after request' }) });
    await expect(analyzeBatchProduct({ ...baseDeps,
      recipes: [{ id: 'recipe_jewelry_master', name: '珠宝首饰全品类', category: 'jewelry_luxury', promptSnippet: '耳饰受光' }],
      selectedArchId: 'recipe_jewelry_master',
    }, item)).rejects.toThrow('stop after request');
    expect(JSON.parse(mocks.apiFetch.mock.calls[0][1].body).templateStyle).toBe('auto');
  });

  it('passes reserved action IDs and previous selections into the API request', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'stop after request' }) });
    await expect(analyzeBatchProduct({ ...baseDeps, batchActionIdsRef: { current: ['earlier-action'] } }, item, 2,
      { actions: [{ id: 'a4' }, { id: 'a7' }, { id: 'a9' }, { id: 'a12' }] })).rejects.toThrow('stop after request');
    const payload = JSON.parse(mocks.apiFetch.mock.calls[0][1].body);
    expect(payload.allocatedAssets.actionIds).toEqual(['a4', 'a7', 'a9', 'a12']);
    expect(payload.previousActionIds).toEqual(['earlier-action']);
    expect(payload.productIndex).toBe(2);
  });
});

it('clears stale errors while a request is pending and settles failures', async () => {
  let rejectRequest!: (error: Error) => void;
  mocks.apiFetch.mockReturnValue(new Promise((_, reject) => { rejectRequest = reject; }));
  let state = [{ ...item, analysisError: '图片已更改，请重新分析商品' }] as BatchProductItem[];
  const setItems: VisionAnalyzeDeps['setItems'] = update => { state = typeof update === 'function' ? update(state) : update; };
  const pending = analyzeBatchProduct({ ...baseDeps, setItems }, item);
  expect(state[0].isAnalyzing).toBe(true);
  expect(state[0].analysisError).toBeUndefined();
  rejectRequest(new Error('network unavailable'));
  await expect(pending).rejects.toThrow();
  expect(state[0].isAnalyzing).toBe(false);
  expect(state[0].analyzedSuccess).toBe(false);
  expect(state[0].analysisError).toContain('network unavailable');
});

it('keeps mixed asset shots even when the legacy global persona setting is false', async () => {
  mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ prompts: [
    { shot_no: 1, has_human: true, shot_type: 'model_shot', prompt: '人物持机' },
    { shot_no: 2, has_human: false, shot_type: 'pure_product', prompt: '手机平放台面' },
    { shot_no: 3, has_human: false, shot_type: 'hand_held_only', prompt: '仅手部持机' },
  ] }) });
  let state = [item];
  await analyzeBatchProduct({ ...baseDeps, hasHumanPersona: false, selectedShotCount: 3,
    setItems: update => { state = typeof update === 'function' ? update(state) : update; },
  }, item);
  expect(JSON.parse(mocks.apiFetch.mock.calls[0][1].body).modelPersona).toBe('asset_driven');
  expect(state[0].prompts.map(p => p.has_human)).toEqual([true, false, false]);
  expect(state[0].prompts[2].shot_type).toBe('hand_held_only');
});
it('does not restore successful analysis after source images changed during the request', async () => {
  let release!: (response: unknown) => void;
  mocks.apiFetch.mockReturnValue(new Promise(resolve => { release = resolve; }));
  let state = [{ ...item }];
  const pending = analyzeBatchProduct({ ...baseDeps, selectedShotCount: 1, getItems: () => state,
    setItems: update => { state = typeof update === 'function' ? update(state) : update; },
  }, item);
  const assertion = expect(pending).rejects.toThrow('图片已更改');
  state = [{ ...state[0], selectedProductImages: ['different-product'] }];
  release({ ok: true, json: async () => ({ prompts: [{ shot_no: 1, prompt: 'old source result' }] }) });
  await assertion;
  expect(state[0].analyzedSuccess).toBe(false);
  expect(state[0].selectedProductImages).toEqual(['different-product']);
});
