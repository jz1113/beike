import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { adaptSalesScriptPlan, fetchSalesStudioAssets, submitAndPollSalesVideo, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { adaptSalesSpokenCopy } from '../api/salesSpokenCopy';
import { listSalesScripts, type StoredSalesScript } from '../api/salesScripts';
import { listSalesPrompts } from '../api/salesPrompts';
import { prepareSalesDepthVideoClip } from '../api/salesVideoClip';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesVideoModelPatch } from '../model/salesVideoCompatibility';
import { useSalesProduction } from './useSalesProduction';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => (await import('./salesProductionTestRuntime')).salesProductionTestHooks(hooks));
vi.mock('./useSalesProductionModels', () => ({ useSalesProductionModels: () => ({ videoModels: [], voiceModels: [] }) }));
vi.mock('../api/salesScripts', () => ({ listSalesScripts: vi.fn() }));
vi.mock('../api/salesPrompts', async (original) => ({ ...await original<typeof import('../api/salesPrompts')>(), listSalesPrompts: vi.fn() }));
vi.mock('../api/salesSpokenCopy', () => ({ adaptSalesSpokenCopy: vi.fn() }));
vi.mock('../api/salesVideoClip', () => ({ prepareSalesDepthVideoClip: vi.fn() }));
vi.mock('../api/salesProduction', () => ({
  fetchSalesStudioAssets: vi.fn(), uploadSalesCustomAsset: vi.fn(), adaptSalesScriptPlan: vi.fn(),
  mixSalesFinalVideo: vi.fn(), submitAndPollSalesVideo: vi.fn(), synthesizeSalesVoiceover: vi.fn(),
}));

const prompts = ['plan-adapt', 'spoken-copy', 'spoken-review', 'final-video', 'final-video-depth'].map((id) => ({
  id, title: id, description: '', prompt: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
  defaultPrompt: '', version: `${id}-v1`, customized: true, configured: true,
}));
const catalog: SalesStudioAssetCatalog = { personas: [], scenes: [], actions: [], voices: [{
  id: 'voice', name: '当前旁白', voiceId: 'narrator', ttsVoice: 'narrator', gender: 'female', tags: [], sampleAudioUrl: '', promptText: '', source: 'voice_library',
}], bgms: [] };
let state: SalesCollectionState;
const onChange = (patch: Partial<SalesCollectionState>) => { state = { ...state, ...patch }; };
function Render() {
  hooks.index = 0;
  const result = useSalesProduction(state, onChange, 0);
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
async function prepare({ depth = false, model = 'doubao-seedance-2.0-mini', voiceMode = 'none' }: {
  depth?: boolean; model?: string; voiceMode?: 'none' | 'voiceover';
} = {}) {
  const times = [0, 2.1, 4.6, 6.8, 10.1, 12.6, 16.6, 18.2];
  const script = normalizeScriptTemplate({ format: 'product', durationSec: 18.8, voiceMode,
    visualSpec: { oneTake: true },
    shots: [{ start: 0, end: 18.8, beats: times.slice(0, -1).map((start, index) => ({
      start, end: times[index + 1], action: `完整动作${index + 1}`, subject: '当前商品', expression: '', transition: '',
    })) }],
  })!;
  const source: StoredSalesScript = { id: 'script', title: '18.8秒商品展示', status: 'verified', script,
    videoUrl: '/source.mp4', depthVideoUrl: '/source-depth.mp4', videoHash: '', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' };
  vi.mocked(listSalesScripts).mockResolvedValue([source]);
  state = { ...state, productName: '当前商品', selectedScriptId: source.id,
    imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
    colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
    productionPlan: { ...state.productionPlan, scriptId: source.id, videoModel: model,
      imitationMode: depth ? 'depth_imitation' : 'script_only', scriptVideoReference: depth ? 'depth' : 'none',
      voiceId: voiceMode === 'voiceover' ? 'voice' : '', voiceModeOverride: voiceMode,
      presentationMode: voiceMode === 'none' ? 'clean_visual' : 'subtitled_intro',
    },
  };
  Render(); await settle();
  return { source, production: Render() };
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks(); state = emptySalesCollection();
  vi.mocked(listSalesScripts).mockResolvedValue([]);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue(catalog);
  vi.mocked(listSalesPrompts).mockResolvedValue(prompts);
  vi.mocked(adaptSalesScriptPlan).mockImplementation(async (input) => ({
    beats: input.beats.map((beat) => ({ index: beat.index, subject: beat.subject || '', action: beat.refAction,
      expression: beat.expression || '', transition: beat.transition || '', spokenLine: '', subtitle: '' })),
    model: 'text', promptVersion: 'plan-adapt-v1',
  }));
  vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => ({
    success: true, beats: input.beats.map((beat) => ({ index: beat.index, spokenLine: '介绍商品', subtitle: '' })),
    model: 'text', promptVersion: 'spoken-copy-v1', reviewPromptVersion: 'spoken-review-v1',
  }));
  vi.mocked(prepareSalesDepthVideoClip).mockImplementation(async ({ endSec }) => ({ url: '/derived-depth.mp4', startSec: 0, endSec, durationSec: endSec }));
  vi.mocked(submitAndPollSalesVideo).mockResolvedValue({ videoUrl: '/generated.mp4', taskId: 'task' });
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups.clear(); });

describe('video model duration planning before production', () => {
  it('requires a fresh storyboard after a scene change and submits the reviewed Omni Flash 10s depth clip', async () => {
    await prepare({ depth: true, model: 'omni_flash-10s' });
    Render().patchPlan({ customSceneImageUrl: '/scene3.jpg' });
    await Render().runPlanAdapt('text');
    Render().patchPlan({ customSceneImageUrl: '/scene4.jpg' });
    const stale = Render();
    expect(stale.generationSourceError).toContain('拍摄场景已变更');
    await stale.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    await expect(Render().runPlanAdapt('text')).resolves.toBe(true);
    expect(Render().generationSourceError).toBe('');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    const request = vi.mocked(submitAndPollSalesVideo).mock.lastCall![0];
    expect(request).toMatchObject({ model: 'omni_flash-10s', durationSec: 10, videos: ['/derived-depth.mp4'] });
    expect(request.images).toContain('/scene4.jpg');
    expect(request.images).not.toContain('/scene3.jpg');
  });

  it.each([false, true])('submits a manually shortened Seedance 2.5 video with only complete retained actions (depth=%s)', async (depth) => {
    const { source, production } = await prepare({ depth, model: 'doubao-seedance-2.5' });
    const original = JSON.stringify(source);
    expect(production.durationPlanning).toMatchObject({ sourceDurationSec: 18.8, targetDurationSec: 19, changed: false });
    production.patchPlan({ videoDurationSec: 10 });
    const shortened = Render();
    expect(shortened.durationPlanning).toMatchObject({ targetDurationSec: 10, changed: true, truncatedEnding: true });
    expect(shortened.activeScript!.script.durationSec).toBe(6.8);
    expect(shortened.activeScript!.script.shots.flatMap((shot) => shot.beats)).toEqual(source.script.shots[0].beats.slice(0, 3));
    await shortened.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    const request = vi.mocked(submitAndPollSalesVideo).mock.lastCall![0];
    expect(request.durationSec).toBe(10);
    for (const index of [1, 2, 3]) expect(request.prompt).toContain(`完整动作${index}`);
    for (const index of [4, 5, 6, 7]) expect(request.prompt).not.toContain(`完整动作${index}`);
    expect(request.prompt).toContain('00:04.6 - 00:06.8');
    if (depth) {
      expect(prepareSalesDepthVideoClip).toHaveBeenCalledExactlyOnceWith({ sourceUrl: '/source-depth.mp4', endSec: 6.8, maxDurationSec: 30 }, expect.any(AbortSignal));
      expect(request.videos).toEqual(['/derived-depth.mp4']);
    } else {
      expect(prepareSalesDepthVideoClip).not.toHaveBeenCalled();
      expect(request.videos).toEqual([]);
    }
    expect(JSON.stringify(source)).toBe(original);
  });

  it('reuses the shortened storyboard and speech when switching to a model with a longer capacity', async () => {
    await prepare({ voiceMode: 'voiceover' });
    await Render().runPlanAdapt('text');
    const before = structuredClone(state.productionPlan.adaptedBeats);
    const current = Render();
    current.patchPlan(salesVideoModelPatch('doubao-seedance-2.5', {
      plan: state.productionPlan, script: current.activeScript!.script,
      references: current.assembled!.references, audios: current.assembled!.audios,
    }));
    const changed = Render();
    expect(changed.durationPlanning).toMatchObject({ targetDurationSec: 13, truncatedEnding: true });
    expect(changed.activeScript!.script.durationSec).toBe(12.6);
    expect(changed.generationSourceError).toBe('');
    await expect(changed.prepareDelivery('text')).resolves.toBe(true);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(state.productionPlan.adaptedBeats).toEqual(before);
  });

  it.each([false, true])('preserves 14 seconds and manual speech when switching to Seedance 2.5 with the original script (depth=%s)', async (depth) => {
    const { source } = await prepare({ depth, voiceMode: 'voiceover' });
    Render().patchPlan({ videoDurationSec: 14 });
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(0, { spokenLine: '这是我确认过的商品介绍', subtitle: '手工确认字幕' });
    const original = structuredClone(state.productionPlan.adaptedBeats);
    Render().patchPlan(salesVideoModelPatch('doubao-seedance-2.5', {
      plan: state.productionPlan, script: source.script, references: Render().assembled!.references,
    }));
    const changed = Render();
    expect(changed.durationPlanning).toMatchObject({ targetDurationSec: 14, truncatedEnding: true });
    expect(changed.activeScript!.script.durationSec).toBe(12.6);
    expect(changed.generationSourceError).toBe('');
    await expect(changed.prepareDelivery('text')).resolves.toBe(true);
    expect(state.productionPlan.videoDurationSec).toBe(14);
    expect(state.productionPlan.adaptedBeats).toEqual(original);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
  });

  it('preserves existing speech after an action window changes and requires an explicit rewrite before generation', async () => {
    await prepare({ model: 'doubao-seedance-2.5', voiceMode: 'voiceover' });
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(0, { spokenLine: '手动确认的口播原文', subtitle: '手工字幕' });
    const original = structuredClone(state.productionPlan.adaptedBeats);
    Render().patchPlan({ videoDurationSec: 14 });
    const shortened = Render();
    expect(shortened.generationSourceError).not.toBe('');
    await expect(shortened.prepareDelivery('text')).resolves.toBe(true);
    expect(state.productionPlan.adaptedBeats).toEqual(original);
    expect(Render().notice).toBe('');
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    await Render().runGenerateVideo('text');
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    await Render().runPlanAdapt('text');
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(Render().generationSourceError).toBe('');
  });

  it('reuses synthesized narration when only output padding changes', async () => {
    await prepare({ voiceMode: 'voiceover' });
    await Render().runPlanAdapt('text');
    Render().patchPlan({ voiceoverAudioUrl: '/current-voice.mp3' });
    Render();
    Render().patchPlan({ videoDurationSec: 15 });
    const changed = Render();
    expect(changed.activeScript!.script.durationSec).toBe(12.6);
    expect(changed.generationSourceError).toBe('');
    expect(state.productionPlan.voiceoverAudioUrl).toBe('/current-voice.mp3');
  });

  it('requires new narration after retiming even when manual wording is unchanged, while retaining audio for an unchanged timeline', async () => {
    await prepare({ voiceMode: 'voiceover' });
    Render().updateAdaptedBeat(0, { spokenLine: '这是一句手动填写的商品介绍' });
    Render();
    Render().patchPlan({ voiceoverAudioUrl: '/current-voice.mp3' });
    Render();
    Render().patchPlan({ videoModel: 'doubao-seedance-2.0' });
    Render();
    expect(state.productionPlan.voiceoverAudioUrl).toBe('/current-voice.mp3');
    Render().patchPlan({ videoDurationSec: 10 });
    Render();
    expect(state.productionPlan.voiceoverAudioUrl).toBe('');
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('这是一句手动填写的商品介绍');
  });

  it('keeps whole storyboard actions and rewrites only retained narration at the original timing', async () => {
    const { source, production } = await prepare({ voiceMode: 'voiceover' });
    const original = JSON.stringify(source.script);
    expect(production.durationPlanning).toMatchObject({ sourceDurationSec: 18.8, targetDurationSec: 13, modelMaxDurationSec: 15, changed: true });
    expect(production.activeScript!.script.durationSec).toBe(12.6);
    expect(production.activeScript!.script.shots.flatMap((shot) => shot.beats)).toEqual(source.script.shots[0].beats.slice(0, 5));
    await production.runPlanAdapt('text');
    const adaptation = vi.mocked(adaptSalesScriptPlan).mock.lastCall![0];
    expect(adaptation.beats.map((beat) => [beat.start, beat.end])).toEqual([[0, 2.1], [2.1, 4.6], [4.6, 6.8], [6.8, 10.1], [10.1, 12.6]]);
    const speech = vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0];
    expect(speech.duration).toBe(13);
    expect(speech.beats).toHaveLength(5);
    expect(speech.beats.every((beat) => beat.end <= 12.6)).toBe(true);
    expect(JSON.stringify(source.script)).toBe(original);
    expect(source.script.durationSec).toBe(18.8);
    expect(prepareSalesDepthVideoClip).not.toHaveBeenCalled();
  });

  it('omits a shortened ending that leads to an excluded shot and restores it with the full script', async () => {
    const { source } = await prepare();
    const lastRetained = source.script.shots[0].beats[4];
    lastRetained.transition = '身体转向袖口，进入后续展示';
    lastRetained.expression = '抬眼后笑意自然回落';
    Render().patchPlan({ videoDurationSec: 15 });
    const shortened = Render();
    expect(shortened.durationPlanning!.truncatedEnding).toBe(true);
    expect(shortened.assembled!.enginePrompt).not.toContain(lastRetained.transition);
    expect(shortened.assembled!.enginePrompt).toContain(lastRetained.expression);
    await shortened.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining(lastRetained.transition),
    }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
    expect(lastRetained.transition).toBe('身体转向袖口，进入后续展示');
    Render().patchPlan({ videoModel: 'doubao-seedance-2.5', videoDurationSec: 0 });
    const restored = Render();
    expect(restored.durationPlanning!.truncatedEnding).toBe(false);
    expect(restored.assembled!.enginePrompt).toContain(lastRetained.transition);
  });

  it('blocks adaptation from the old timeline after switching models and preserves manual actions', async () => {
    await prepare({ model: 'doubao-seedance-2.5' });
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(0, { action: '手动托起商品后停留' });
    const previousSourceKey = state.productionPlan.adaptedSourceKey;
    Render().patchPlan(salesVideoModelPatch('doubao-seedance-2.0-mini'));
    const shortened = Render();
    expect(shortened.activeScript!.script.durationSec).toBeLessThanOrEqual(15);
    expect(state.productionPlan.adaptedSourceKey).toBe(previousSourceKey);
    expect(state.productionPlan.adaptedBeats[0].action).toBe('手动托起商品后停留');
    expect(shortened.generationSourceError).not.toBe('');
    await shortened.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).not.toBe('');
  });

  it('keeps complete depth motion beats and submits the derived clip URL before any paid generation', async () => {
    const { source, production } = await prepare({ depth: true });
    const original = JSON.stringify(source);
    const beats = production.activeScript!.script.shots.flatMap((shot) => shot.beats);
    expect(beats.map((beat) => [beat.start, beat.end])).toEqual([[0, 2.1], [2.1, 4.6], [4.6, 6.8], [6.8, 10.1], [10.1, 12.6]]);
    expect(production.activeScript!.script.durationSec).toBe(12.6);
    await production.runGenerateVideo();
    expect(prepareSalesDepthVideoClip).toHaveBeenCalledExactlyOnceWith({ sourceUrl: '/source-depth.mp4', endSec: 12.6, maxDurationSec: 15 }, expect.any(AbortSignal));
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    const request = vi.mocked(submitAndPollSalesVideo).mock.lastCall![0];
    expect(request.videos).toEqual(['/derived-depth.mp4']);
    expect(request.durationSec).toBeLessThanOrEqual(15);
    expect(request.prompt).toContain('00:10.1 - 00:12.6');
    expect(vi.mocked(prepareSalesDepthVideoClip).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(submitAndPollSalesVideo).mock.invocationCallOrder[0]);
    expect(JSON.stringify(source)).toBe(original);
  });

  it.each([false, true])('restores manual later actions when returning from a shortened window to the full script (depth=%s)', async (depth) => {
    await prepare({ depth, model: 'doubao-seedance-2.5' });
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(6, { action: '手动结尾转身并停留', expression: '回眸自然收势' });
    Render().patchPlan(salesVideoModelPatch('doubao-seedance-2.0-mini'));
    const shortened = Render();
    expect(shortened.activeScript!.script.shots.flatMap((shot) => shot.beats)).toHaveLength(5);
    await shortened.runPlanAdapt('text');
    expect(vi.mocked(adaptSalesScriptPlan).mock.lastCall![0].beats).toHaveLength(5);
    expect(state.productionPlan.adaptedBeats.find((beat) => beat.index === 6))
      .toMatchObject({ action: '手动结尾转身并停留', expression: '回眸自然收势', manualPerformanceFields: ['action', 'expression'] });
    Render().patchPlan(salesVideoModelPatch('doubao-seedance-2.5'));
    const restored = Render();
    expect(restored.activeScript!.script.shots.flatMap((shot) => shot.beats)).toHaveLength(7);
    expect(restored.assembled!.enginePrompt).toContain('手动结尾转身并停留');
    await restored.runPlanAdapt('text');
    expect(vi.mocked(adaptSalesScriptPlan).mock.lastCall![0].beats[6])
      .toMatchObject({ refAction: '手动结尾转身并停留', expression: '回眸自然收势' });
    expect(state.productionPlan.adaptedBeats).toHaveLength(7);
  });

  it('does not submit the full source video when preparing the shortened depth clip fails', async () => {
    const { source, production } = await prepare({ depth: true });
    vi.mocked(prepareSalesDepthVideoClip).mockRejectedValueOnce(new Error('深度视频裁剪失败'));
    await production.runGenerateVideo();
    expect(prepareSalesDepthVideoClip).toHaveBeenCalledOnce();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('深度视频裁剪失败');
    expect(source.depthVideoUrl).toBe('/source-depth.mp4');
    expect(state.productionPlan.generatedVideoUrl).toBe('');
  });
});
