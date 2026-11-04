import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembleSalesVideoPrompt, normalizeScriptTemplate } from '@shared/domain/sales';
import { prepareSalesProductionVideos } from '../api/salesDepthReference';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { useSalesDepthReferences } from './useSalesDepthReferences';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => (await import('./salesProductionTestRuntime')).salesProductionTestHooks(hooks));
vi.mock('../api/salesDepthReference', () => ({ prepareSalesProductionVideos: vi.fn() }));

const script = normalizeScriptTemplate({ format: 'product', voiceMode: 'none', durationSec: 12.6,
  shots: [{ beats: [{ start: 0, end: 12.6, action: '完整动作' }] }],
})!;
const assembled = assembleSalesVideoPrompt({ finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
  script, selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }], productName: '商品', persona: null, scene: null,
  beatBindings: [], imitationMode: 'depth_imitation', scriptVideoReference: { kind: 'depth', url: '/long-depth.mp4' },
});
const input = { active: true, script, assembled, plan: { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', imitationMode: 'depth_imitation' as const, scriptVideoReference: 'depth' as const } };
function Render(patch: Partial<Parameters<typeof useSalesDepthReferences>[0]> = {}) {
  hooks.index = 0;
  const result = useSalesDepthReferences({ ...input, ...patch });
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function settle() { for (let index = 0; index < 5; index += 1) await Promise.resolve(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks();
  vi.mocked(prepareSalesProductionVideos).mockResolvedValue(['/prepared-depth.mp4']);
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups.clear(); });

describe('prepared depth references for review', () => {
  it('prepares the action window before exposing its actual URL for review and reuses it when returning', async () => {
    const original = JSON.stringify(assembled);
    expect(Render().preparing).toBe(true);
    expect(prepareSalesProductionVideos).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: '/long-depth.mp4', videos: ['/long-depth.mp4'], endSec: 12.6, durationSec: 13, model: input.plan.videoModel,
    }), expect.any(AbortSignal), expect.any(Function));
    await settle();
    const ready = Render();
    expect(ready.preparing).toBe(false);
    expect(ready.error).toBe('');
    expect(ready.assembled.references.map((slot) => slot.url)).toEqual(['/product.jpg', '/prepared-depth.mp4']);
    expect(ready.assembled.enginePrompt).toBe(assembled.enginePrompt);
    expect(JSON.stringify(assembled)).toBe(original);
    Render({ active: false }); Render();
    expect(prepareSalesProductionVideos).toHaveBeenCalledOnce();
    expect(Render().assembled.references.at(-1)?.url).toBe('/prepared-depth.mp4');
  });

  it('aborts stale preparation when the motion source changes and ignores its late result', async () => {
    const first = deferred<string[]>(); const next = deferred<string[]>();
    vi.mocked(prepareSalesProductionVideos).mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    Render();
    const signal = vi.mocked(prepareSalesProductionVideos).mock.calls[0][1];
    const changed = { ...assembled, references: assembled.references.map((slot) => slot.mediaType === 'video' ? { ...slot, url: '/other-depth.mp4' } : slot) };
    expect(Render({ assembled: changed }).preparing).toBe(true);
    expect(signal.aborted).toBe(true);
    next.resolve(['/other-prepared.mp4']); await settle();
    expect(Render({ assembled: changed }).assembled.references.at(-1)?.url).toBe('/other-prepared.mp4');
    first.resolve(['/stale-prepared.mp4']); await settle();
    expect(Render({ assembled: changed }).assembled.references.at(-1)?.url).toBe('/other-prepared.mp4');
  });

  it('returns preparation errors without treating the source video as ready', async () => {
    vi.mocked(prepareSalesProductionVideos).mockRejectedValueOnce(new Error('片段实测时长不符合模型限制'));
    Render(); await settle();
    const failed = Render();
    expect(failed.preparing).toBe(false);
    expect(failed.error).toBe('片段实测时长不符合模型限制');
    expect(failed.assembled.references.at(-1)?.url).toBe('/long-depth.mp4');
    expect(failed.canRetry).toBe(true);
    failed.retry();
    expect(Render().preparing).toBe(true);
    await settle();
    expect(Render().assembled.references.at(-1)?.url).toBe('/prepared-depth.mp4');
    expect(prepareSalesProductionVideos).toHaveBeenCalledTimes(2);
  });

  it('cancels when leaving the delivery view and skips pure storyboard references', () => {
    vi.mocked(prepareSalesProductionVideos).mockReturnValue(new Promise(() => {}));
    Render(); const signal = vi.mocked(prepareSalesProductionVideos).mock.calls[0][1];
    Render({ active: false });
    expect(signal.aborted).toBe(true);
    const plain = Render({ assembled: { ...assembled, imitationMode: 'script_only' } });
    expect(plain.preparing).toBe(false);
    expect(plain.error).toBe('');
    expect(prepareSalesProductionVideos).toHaveBeenCalledOnce();
  });
});
