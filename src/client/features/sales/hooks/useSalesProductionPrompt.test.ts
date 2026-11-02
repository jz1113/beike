import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptSalesScriptPlan, fetchSalesStudioAssets, submitAndPollSalesVideo, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { listSalesScripts } from '../api/salesScripts';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { useSalesProduction } from './useSalesProduction';
import { salesPlanAdaptationSourceKey } from '../model/salesPlanSource';
import { listSalesPrompts } from '../api/salesPrompts';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', () => {
  const same = (left: unknown[] | undefined, right: unknown[]) => left?.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const memo = (create: () => unknown, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { deps: unknown[]; value: unknown } | undefined;
    if (!previous || !same(previous.deps, deps)) hooks.slots[index] = { deps, value: create() };
    return (hooks.slots[index] as { value: unknown }).value;
  };
  return {
    useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps),
    useMemo: memo,
    useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
      const index = hooks.index++;
      if (same(hooks.slots[index] as unknown[] | undefined, deps)) return;
      hooks.slots[index] = deps;
      hooks.pending.push(() => {
        hooks.cleanups.get(index)?.();
        hooks.cleanups.delete(index);
        const cleanup = fn();
        if (cleanup) hooks.cleanups.set(index, cleanup);
      });
    },
    useRef: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useState: <T>(initial: T | (() => T)) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
        hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
      }];
    },
  };
});
vi.mock('./useSalesProductionModels', () => ({ useSalesProductionModels: () => ({ videoModels: [], voiceModels: [] }) }));
vi.mock('../api/salesScripts', () => ({ listSalesScripts: vi.fn() }));
vi.mock('../api/salesPrompts', () => ({ listSalesPrompts: vi.fn() }));
vi.mock('../api/salesProduction', () => ({
  fetchSalesStudioAssets: vi.fn(), uploadSalesCustomAsset: vi.fn(), adaptSalesScriptPlan: vi.fn(),
  mixSalesFinalVideo: vi.fn(), submitAndPollSalesVideo: vi.fn(), synthesizeSalesVoiceover: vi.fn(),
}));

let state: SalesCollectionState;
const onChange = (patch: Partial<SalesCollectionState>) => { state = { ...state, ...patch }; };
const catalog: SalesStudioAssetCatalog = { personas: [], scenes: [], actions: [], voices: [], bgms: [] };
const currentPrompt = { id: 'plan-adapt', title: '商品分镜改编', description: '', prompt: '当前规则', defaultPrompt: '默认规则', version: 'test', customized: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function Render(version = 0) {
  hooks.index = 0;
  const result = useSalesProduction(state, onChange, version);
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
async function settle() { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }
function unmount() { hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups.clear(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks(); state = emptySalesCollection();
  vi.mocked(listSalesScripts).mockResolvedValue([]);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue(catalog);
  vi.mocked(listSalesPrompts).mockResolvedValue([currentPrompt]);
});
afterEach(unmount);

describe('current prompt provenance before video generation', () => {
  async function prepareReference() {
    const script = normalizeScriptTemplate({ durationSec: 5, format: 'product', voiceMode: 'none',
      shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', videoUrl: '', videoHash: '',
      status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    state = { ...state, productName: '当前商品', selectedScriptId: 'script', imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: { ...state.productionPlan, scriptId: 'script' } };
    vi.mocked(submitAndPollSalesVideo).mockResolvedValue({ videoUrl: '/generated.mp4', taskId: 'task' });
    Render(); await settle(); return Render();
  }

  function markAutoAdapted(version = 'test') {
    const production = Render();
    state.productionPlan = { ...state.productionPlan,
      adaptedBeats: [{ index: 0, subject: '商品', action: '展示当前商品', expression: '', transition: '', spokenLine: '', subtitle: '' }],
      adaptedSourceKey: salesPlanAdaptationSourceKey(state, production.activeScript!.script, production.selectedScene), adaptedPromptVersion: version,
    };
  }

  it('rechecks the saved prompt version on each generation and preserves edits when it changes', async () => {
    await prepareReference(); markAutoAdapted();
    Render().updateAdaptedBeat(0, { action: '保留我的手工动作修改' });
    expect(state.productionPlan.adaptedPromptVersion).toBe('test');
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    vi.mocked(listSalesPrompts).mockResolvedValue([{ ...currentPrompt, version: 'new-version' }]);
    await Render().runGenerateVideo();
    expect(listSalesPrompts).toHaveBeenCalledTimes(2);
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    expect(Render().error).toContain('提示词已更新');
    expect(state.productionPlan.adaptedBeats[0].action).toBe('保留我的手工动作修改');
    expect(state.productionPlan.adaptedPromptVersion).toBe('test');
  });

  it('blocks legacy automatic drafts without provenance instead of treating them as current defaults', async () => {
    await prepareReference(); markAutoAdapted('');
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('未记录提示词版本');
    expect(state.productionPlan.adaptedBeats).toHaveLength(1);
  });

  it('still allows manual-only edits without pretending that automatic adaptation was run', async () => {
    await prepareReference();
    Render().updateAdaptedBeat(0, { action: '用户手工编写的动作' });
    await Render().runGenerateVideo();
    expect(listSalesPrompts).not.toHaveBeenCalled();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
  });

  it('never submits using defaults when the current prompt cannot be read', async () => {
    await prepareReference(); markAutoAdapted();
    vi.mocked(listSalesPrompts).mockRejectedValue(new Error('提示词读取失败'));
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('提示词读取失败');
    vi.mocked(listSalesPrompts).mockResolvedValue([]);
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('未能读取当前商品分镜改编提示词');
  });

  it('does not submit a snapshot canceled while waiting for prompt verification', async () => {
    await prepareReference(); markAutoAdapted();
    const pending = deferred<Awaited<ReturnType<typeof listSalesPrompts>>>();
    vi.mocked(listSalesPrompts).mockReturnValue(pending.promise);
    const request = Render().runGenerateVideo();
    const signal = vi.mocked(listSalesPrompts).mock.calls[0][0]!;
    state = { ...state, productName: '变更后的商品' };
    Render();
    expect(signal.aborted).toBe(true);
    pending.resolve([currentPrompt]); await request;
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('stops before any video request after changing the scene and preserves the previous adaptation', async () => {
    await prepareReference(); markAutoAdapted();
    const beats = state.productionPlan.adaptedBeats;
    Render().patchPlan({ customSceneImageUrl: '/new-scene.jpg' });
    await Render().runGenerateVideo();
    expect(Render().error).toContain('拍摄场景已变更');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(listSalesPrompts).not.toHaveBeenCalled();
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });

  it('retains a deleted scene selection and blocks generation instead of replacing it with a recommendation', async () => {
    const scene = (id: string) => ({ id, title: id, description: '', lighting: '', category: '', spatialType: 'indoor', tags: '', suitableCategories: [], coverUrl: `/${id}.jpg`, sourceImages: [], source: 'scene_library' });
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, scenes: [scene('chosen'), scene('recommended')] });
    await prepareReference();
    Render().patchPlan({ sceneId: 'chosen' });
    expect(Render().selectedScene?.id).toBe('chosen');
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, scenes: [scene('recommended')] });
    Render(1); await settle();
    const production = Render(1);
    expect(state.productionPlan.sceneId).toBe('chosen');
    expect(production.selectedScene).toBeNull();
    expect(production.assembled!.references.some((ref) => ref.kind === 'scene')).toBe(false);
    await production.runPlanAdapt('text-model');
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    expect(Render(1).error).toContain('所选场景的参考图不可用');
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render(1).error).toContain('所选场景的参考图不可用');
  });

  it('stops after same-ID script edits are reloaded, clearing stale output without deleting beats', async () => {
    const original = (await prepareReference()).activeScript!;
    markAutoAdapted();
    await Render().runGenerateVideo();
    Render();
    const beats = state.productionPlan.adaptedBeats;
    expect(state.productionPlan.generatedVideoUrl).toBe('/generated.mp4');
    const updated = structuredClone(original);
    updated.script.shots[0].beats[0].expression = '回到中性表情后再浅笑';
    vi.mocked(listSalesScripts).mockResolvedValue([updated]);
    Render(1); await settle();
    await Render(1).runGenerateVideo();
    expect(Render(1).error).toContain('参考脚本内容已更新');
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    expect(state.productionPlan.generatedVideoUrl).toBe('');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });

  it('blocks changed product facts without requiring a prior selling-point extraction', async () => {
    await prepareReference(); markAutoAdapted();
    const beats = state.productionPlan.adaptedBeats;
    expect(state.productSummary).toBeUndefined();
    state = { ...state, props: { 成分: '亚麻' } };
    await Render().runGenerateVideo();
    expect(Render().error).toContain('商品资料已更新');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(listSalesPrompts).not.toHaveBeenCalled();
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });
});
