import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { adaptSalesScriptPlan, fetchSalesStudioAssets, submitAndPollSalesVideo, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { adaptSalesSpokenCopy, SalesSpokenCopyRequestError } from '../api/salesSpokenCopy';
import { listSalesScripts } from '../api/salesScripts';
import { listSalesPrompts } from '../api/salesPrompts';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { useSalesProduction } from './useSalesProduction';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => (await import('./salesProductionTestRuntime')).salesProductionTestHooks(hooks));
vi.mock('./useSalesProductionModels', () => ({ useSalesProductionModels: () => ({ videoModels: [], voiceModels: [] }) }));
vi.mock('../api/salesScripts', () => ({ listSalesScripts: vi.fn() }));
vi.mock('../api/salesPrompts', async (original) => ({ ...await original<typeof import('../api/salesPrompts')>(), listSalesPrompts: vi.fn() }));
vi.mock('../api/salesSpokenCopy', async (original) => ({ ...await original<typeof import('../api/salesSpokenCopy')>(), adaptSalesSpokenCopy: vi.fn() }));
vi.mock('../api/salesProduction', () => ({
  fetchSalesStudioAssets: vi.fn(), uploadSalesCustomAsset: vi.fn(), adaptSalesScriptPlan: vi.fn(),
  mixSalesFinalVideo: vi.fn(), submitAndPollSalesVideo: vi.fn(), synthesizeSalesVoiceover: vi.fn(),
}));

const prompts = ['plan-adapt', 'spoken-copy', 'spoken-review', 'final-video', 'final-video-depth'].map((id) => ({
  id, title: id, description: '', prompt: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
  defaultPrompt: '', version: `${id}-v1`, customized: true, configured: true,
}));
const catalog: SalesStudioAssetCatalog = { scenes: [], actions: [], voices: [], bgms: [],
  personas: ['first', 'second'].map((id) => ({ id, name: `人物${id}`, description: '', tags: '',
    avatarUrl: `/${id}-face.jpg`, fullBodyUrl: `/${id}-body.jpg`, faceUrl: `/${id}-face.jpg`,
    sourceImages: [], hasReferenceImage: true, source: 'persona_library' })),
};
let state: SalesCollectionState;
const onChange = (patch: Partial<SalesCollectionState>) => { state = { ...state, ...patch }; };
function Render() {
  hooks.index = 0;
  const result = useSalesProduction(state, onChange);
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
function adaptedResult() {
  return { beats: [{ index: 0, subject: '当前人物与商品', action: '托起商品展示',
    expression: '', transition: '', spokenLine: '', subtitle: '' }], model: 'text', promptVersion: 'plan-adapt-v1' };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function prepare(voiceMode: 'none' | 'speech' = 'speech') {
  const script = normalizeScriptTemplate({ format: 'presenter', durationSec: 5, voiceMode,
    shots: [{ beats: [{ start: 0, end: 5, subject: '人物与商品', action: '托起商品展示', expression: '', transition: '' }] }],
  })!;
  vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', status: 'verified', script,
    videoUrl: '', videoHash: '', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
  state = { ...state, productName: '当前商品', selectedScriptId: 'script',
    imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
    colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
    productionPlan: { ...state.productionPlan, scriptId: 'script', personaId: 'first',
      voiceModeOverride: voiceMode, presentationMode: voiceMode === 'none' ? 'clean_visual' : 'subtitled_intro' },
  };
  Render(); await settle(); return Render();
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks(); state = emptySalesCollection();
  vi.mocked(listSalesScripts).mockResolvedValue([]);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue(catalog);
  vi.mocked(listSalesPrompts).mockResolvedValue(prompts);
  vi.mocked(adaptSalesScriptPlan).mockResolvedValue(adaptedResult());
  vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => ({ success: true,
    beats: input.beats.map((beat) => ({ index: beat.index, spokenLine: '介绍当前商品', subtitle: '当前商品' })),
    model: 'text', promptVersion: 'spoken-copy-v1', reviewPromptVersion: 'spoken-review-v1' }));
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups.clear(); });

describe('preparing delivery without replacing an existing storyboard', () => {
  it('waits for the first complete rewrite before advancing without submitting a video', async () => {
    const production = await prepare();
    const pending = deferred<Awaited<ReturnType<typeof adaptSalesScriptPlan>>>();
    vi.mocked(adaptSalesScriptPlan).mockReturnValue(pending.promise);
    let advanced = false;
    const request = production.prepareDelivery('text').then((ready) => { advanced = ready; return ready; });
    await settle();
    expect(Render().busy).toBe('adapt');
    expect(advanced).toBe(false);
    expect(state.productionPlan.adaptedBeats).toEqual([]);
    pending.resolve(adaptedResult());
    await expect(request).resolves.toBe(true);
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('介绍当前商品');
    expect(state.productionPlan).toMatchObject({ adaptedPromptVersion: 'plan-adapt-v1', spokenCopyPromptVersion: 'spoken-copy-v1', spokenReviewPromptVersion: 'spoken-review-v1' });
    expect(Render().notice).toBe('分镜改写成功，已更新本次分镜。');
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('checks the final script from the committed rewrite and reports an unavailable template', async () => {
    await prepare();
    await Render().prepareDelivery('text');
    const production = Render();
    expect(production.checkDeliveryScript()).toBe(true);
    expect(production.assembled?.enginePrompt).toContain('介绍当前商品');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();

    vi.mocked(listSalesPrompts).mockResolvedValue(prompts.filter((prompt) => !prompt.id.startsWith('final-video')));
    production.reloadAssets();
    Render(); await settle();
    expect(Render().checkDeliveryScript()).toBe(false);
    expect(Render().error).toContain('配置并保存');
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('介绍当前商品');
  });

  it('reopens a current storyboard without rewriting manual dialogue or clearing finished media', async () => {
    await prepare();
    await Render().prepareDelivery('text');
    Render().updateAdaptedBeat(0, { spokenLine: '我手动修订的台词', subtitle: '手工字幕' });
    Render(); Render();
    Render().patchPlan({ generatedVideoUrl: '/existing.mp4' });
    Render().patchPlan({ mixedVideoUrl: '/existing-final.mp4' });
    Render(); Render();
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(state.productionPlan.adaptedBeats[0]).toMatchObject({ spokenLine: '我手动修订的台词', subtitle: '手工字幕' });
    expect(state.productionPlan).toMatchObject({ generatedVideoUrl: '/existing.mp4', mixedVideoUrl: '/existing-final.mp4' });
    expect(Render().notice).toBe('');
  });

  it.each(['product', 'persona'] as const)('preserves the current draft after %s changes until an explicit rewrite', async (field) => {
    await prepare();
    await Render().prepareDelivery('text');
    Render().updateAdaptedBeat(0, { spokenLine: '我手动修订的台词', subtitle: '手工字幕' });
    const original = state.productionPlan.adaptedBeats;
    if (field === 'product') state = { ...state, productName: '更新后的商品' };
    else Render().selectPersona('second');
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(state.productionPlan.adaptedBeats).toBe(original);
    const sourceError = Render().generationSourceError;
    expect(sourceError).not.toBe('');
    expect(Render().notice).toBe('');
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    await expect(Render().runPlanAdapt('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    const input = vi.mocked(adaptSalesScriptPlan).mock.lastCall![0];
    if (field === 'product') expect(input.productName).toBe('更新后的商品');
    else expect(input.personaSummary).toContain('人物second');
  });

  it('preserves the current draft when a silent storyboard changes to speech', async () => {
    await prepare('none');
    await Render().prepareDelivery('text');
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
    const original = state.productionPlan.adaptedBeats;
    Render().setVoiceMode('speech');
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
    expect(state.productionPlan.adaptedBeats).toBe(original);
    await expect(Render().runPlanAdapt('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('介绍当前商品');
  });

  it.each(['manual', 'plan', 'speech'] as const)('keeps a %s draft without complete automatic provenance', async (kind) => {
    await prepare();
    if (kind !== 'manual') await Render().prepareDelivery('text');
    Render().updateAdaptedBeat(0, { action: '手工确认的展示动作', spokenLine: '手工确认的口播', subtitle: '手工字幕' });
    if (kind === 'plan') Render().patchPlan({ adaptedSourceKey: '', adaptedPromptVersion: '' });
    if (kind === 'speech') Render().patchPlan({ spokenCopySourceKey: '', spokenCopyPromptVersion: '' });
    const original = state.productionPlan.adaptedBeats;
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(state.productionPlan.adaptedBeats).toBe(original);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(kind === 'manual' ? 0 : 1);
    expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(kind === 'manual' ? 0 : 1);
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('keeps narration when a new output duration only changes padding after the retained storyboard', async () => {
    await prepare();
    await Render().prepareDelivery('text');
    Render().patchPlan({ videoDurationSec: 10 });
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(Render().generationSourceError).toBe('');
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('介绍当前商品');
  });

  it('preserves the previous storyboard when an explicit rewrite fails', async () => {
    await prepare();
    await Render().prepareDelivery('text');
    const original = state.productionPlan.adaptedBeats;
    state = { ...state, productName: '下一件商品' };
    vi.mocked(adaptSalesScriptPlan).mockRejectedValueOnce(new Error('改写失败'));
    await expect(Render().runPlanAdapt('text')).resolves.toBe(false);
    expect(state.productionPlan.adaptedBeats).toBe(original);
    expect(Render().error).toContain('分镜改写失败：改写失败');
    expect(Render().notice).toBe('');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('keeps the old storyboard during a review timeout and resumes the unpublished draft on retry', async () => {
    await prepare();
    Render().updateAdaptedBeat(0, { action: '原手工动作', spokenLine: '原手工台词', subtitle: '原手工字幕' });
    const original = state.productionPlan.adaptedBeats;
    const pendingReview = { beats: [{ index: 0, spokenLine: '本次待验收台词', subtitle: '本次关键词' }], promptVersion: 'spoken-copy:pending' };
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(new SalesSpokenCopyRequestError('语义验收暂时超时', 'summary_timeout', pendingReview));
    await expect(Render().runPlanAdapt('text')).resolves.toBe(false);
    expect(state.productionPlan.adaptedBeats).toBe(original);
    expect(Render().error).toContain('原分镜已保留');
    expect(state.productionPlan.spokenReviewPromptVersion).toBe('');
    vi.mocked(adaptSalesSpokenCopy).mockResolvedValueOnce({ success: true, beats: pendingReview.beats,
      model: 'text', promptVersion: '', reviewPromptVersion: 'spoken-review-v1' });
    await expect(Render().runPlanAdapt('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0]).toMatchObject({ reviewOnly: true, beats: pendingReview.beats });
    expect(state.productionPlan.adaptedBeats[0]).toMatchObject(pendingReview.beats[0]);
    expect(state.productionPlan).toMatchObject({ spokenCopyPromptVersion: 'spoken-copy:pending', spokenReviewPromptVersion: 'spoken-review-v1' });
    expect(Render().error).toBe('');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('invalidates an unpublished review candidate when the user edits the retained storyboard', async () => {
    await prepare();
    const pendingReview = { beats: [{ index: 0, spokenLine: '旧待审台词', subtitle: '旧关键词' }], promptVersion: 'spoken-copy:pending' };
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(new SalesSpokenCopyRequestError('验收超时', 'summary_timeout', pendingReview));
    await expect(Render().prepareDelivery('text')).resolves.toBe(false);
    Render().updateAdaptedBeat(0, { spokenLine: '用户新写的台词' });
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('用户新写的台词');
    await expect(Render().runPlanAdapt('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it.each(['cancel', 'obsolete'] as const)('does not replace manual edits after an %s explicit rewrite', async (reason) => {
    await prepare('none');
    Render().updateAdaptedBeat(0, { action: '手工动作等待改写' });
    const original = state.productionPlan.adaptedBeats;
    const pending = deferred<Awaited<ReturnType<typeof adaptSalesScriptPlan>>>();
    vi.mocked(adaptSalesScriptPlan).mockReturnValue(pending.promise);
    const request = Render().runPlanAdapt('text');
    const signal = vi.mocked(adaptSalesScriptPlan).mock.lastCall![2]!;
    if (reason === 'cancel') Render().cancel();
    else { state = { ...state, productName: '任务开始后更换商品' }; Render(); }
    expect(signal.aborted).toBe(true);
    pending.resolve(adaptedResult());
    await expect(request).resolves.toBe(false);
    expect(state.productionPlan.adaptedBeats).toBe(original);
  });

  it('keeps rapid repeated clicks in one rewrite task and blocks advancing while it is busy', async () => {
    const production = await prepare('none');
    const pending = deferred<Awaited<ReturnType<typeof adaptSalesScriptPlan>>>();
    vi.mocked(adaptSalesScriptPlan).mockReturnValue(pending.promise);
    const request = production.prepareDelivery('text');
    await expect(production.prepareDelivery('text')).resolves.toBe(false);
    await expect(Render().prepareDelivery('')).resolves.toBe(false);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    pending.resolve(adaptedResult());
    await expect(request).resolves.toBe(true);
  });

  it('allows the existing manual workflow without a rewrite model', async () => {
    await prepare();
    Render().updateAdaptedBeat(0, { action: '完整手工分镜', spokenLine: '手工台词' });
    const original = state.productionPlan.adaptedBeats;
    await expect(Render().prepareDelivery('')).resolves.toBe(true);
    expect(state.productionPlan.adaptedBeats).toBe(original);
    expect(Render().notice).toBe('未配置改写模型，本次使用手动分镜。');
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
  });

  it('can open the empty delivery view before a script is selected', async () => {
    Render(); await settle();
    await expect(Render().prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
  });
});
