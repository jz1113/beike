import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSalesStudioAssets, mixSalesFinalVideo, submitAndPollSalesVideo, synthesizeSalesVoiceover, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { normalizeScriptTemplate, type SalesVoiceCandidate } from '@shared/domain/sales';
import { listSalesScripts } from '../api/salesScripts';
import { listSalesPrompts } from '../api/salesPrompts';
import { adaptSalesSpokenCopy } from '../api/salesSpokenCopy';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesVideoModelPatch } from '../model/salesVideoCompatibility';
import { useSalesProduction } from './useSalesProduction';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => (await import('./salesProductionTestRuntime')).salesProductionTestHooks(hooks));
vi.mock('./useSalesProductionModels', () => ({ useSalesProductionModels: () => ({ videoModels: [], voiceModels: [] }) }));
vi.mock('../api/salesScripts', () => ({ listSalesScripts: vi.fn() }));
vi.mock('../api/salesPrompts', async (original) => ({ ...await original<typeof import('../api/salesPrompts')>(), listSalesPrompts: vi.fn() }));
vi.mock('../api/salesSpokenCopy', () => ({ adaptSalesSpokenCopy: vi.fn() }));
vi.mock('../api/salesProduction', () => ({
  fetchSalesStudioAssets: vi.fn(), uploadSalesCustomAsset: vi.fn(), adaptSalesScriptPlan: vi.fn(),
  mixSalesFinalVideo: vi.fn(), submitAndPollSalesVideo: vi.fn(), synthesizeSalesVoiceover: vi.fn(),
}));

const sampleVoice: SalesVoiceCandidate = { id: 'chosen-voice', name: '本次选择的人声', ttsVoice: 'voice-code', voiceId: 'voice-code', gender: 'female', tags: ['自然'], sampleAudioUrl: '/chosen-sample.mp3', promptText: '', source: 'voice_library' };
const catalog: SalesStudioAssetCatalog = { personas: [], scenes: [], actions: [], voices: [sampleVoice], bgms: [] };
const reviewPrompt = { id: 'spoken-review', title: '口播语义验收', description: '', prompt: '审核完整句意、事实和画面对应',
  defaultPrompt: '', version: 'review-v1', configured: true, customized: true };
let state: SalesCollectionState;
const onChange = (patch: Partial<SalesCollectionState>) => { state = { ...state, ...patch }; };
function Render(version = 0) {
  hooks.index = 0;
  const result = useSalesProduction(state, onChange, version);
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
async function settle() { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks(); state = { ...emptySalesCollection(), summaryModel: 'text-model' };
  vi.mocked(listSalesScripts).mockResolvedValue([]);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue(catalog);
  vi.mocked(listSalesPrompts).mockResolvedValue([{ id: 'final-video', title: '纯分镜版', description: '', prompt: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', defaultPrompt: '初始规则', version: 'final-v1', configured: true, customized: true }, reviewPrompt]);
  vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => {
    if (!input.reviewOnly) throw new Error('本测试只允许验收原稿，不自动改写');
    return { success: true, beats: input.beats.map((beat) => ({ index: beat.index,
      spokenLine: beat.spokenLine || '', subtitle: beat.subtitle || '' })),
    model: 'text-model', promptVersion: 'spoken-copy-v1', reviewPromptVersion: reviewPrompt.version };
  });
  vi.mocked(submitAndPollSalesVideo).mockResolvedValue({ videoUrl: '/generated.mp4', taskId: 'task' });
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups.clear(); });

describe('voiceover and final mix consistency', () => {
  async function prepareVoiceover(voiceModeOverride: '' | 'voiceover' = 'voiceover') {
    const script = normalizeScriptTemplate({ title: '商品展示', durationSec: 5, voiceMode: 'voiceover',
      shots: [{ start: 0, end: 5, beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', videoUrl: '', videoHash: '',
      status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    state = { ...state, selectedScriptId: 'script', productionPlan: { ...state.productionPlan,
      scriptId: 'script', voiceId: sampleVoice.id, voiceModeOverride, generatedVideoUrl: '/raw.mp4',
      voiceoverAudioUrl: '/old-voice.mp3', mixedVideoUrl: '/old-final.mp4',
      adaptedBeats: [{ index: 0, subject: '商品', action: '展示商品', spokenLine: '已核对台词', subtitle: '' }],
    } };
    Render(); await settle();
    return Render();
  }

  it.each(['', 'voiceover'] as const)('blocks mixing after narration changes until a new voiceover is ready (override=%s)', async (override) => {
    const prod = await prepareVoiceover(override);
    prod.updateAdaptedBeat(0, { spokenLine: '修订后的台词' });
    Render();
    expect(state.productionPlan).toMatchObject({ voiceoverAudioUrl: '', mixedVideoUrl: '', generatedVideoUrl: '' });
    Render().patchPlan({ generatedVideoUrl: '/updated-raw.mp4' });
    await Render().runMixFinal();
    expect(mixSalesFinalVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('请先为当前分镜台词合成配音');
  });

  it('replaces audio only on success and requires remixing the new voiceover', async () => {
    const prod = await prepareVoiceover();
    vi.mocked(synthesizeSalesVoiceover).mockRejectedValueOnce(new Error('渠道暂不可用'));
    await prod.runSynthesizeVoice();
    expect(state.productionPlan).toMatchObject({ voiceoverAudioUrl: '/old-voice.mp3', mixedVideoUrl: '/old-final.mp4' });
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValueOnce({ audioUrl: '/new-voice.mp3', taskId: 'voice-task' });
    await Render().runSynthesizeVoice();
    expect(state.productionPlan).toMatchObject({ voiceoverAudioUrl: '/new-voice.mp3', mixedVideoUrl: '', generatedVideoUrl: '/raw.mp4' });
  });
});

describe('explicit voice selection and speech references', () => {
  async function prepare(mode: 'speech' | 'voiceover' | 'none' = 'speech', voice: SalesVoiceCandidate | null = sampleVoice, text = '这是本次完整的商品介绍台词。') {
    const script = normalizeScriptTemplate({ durationSec: 15, format: 'product', voiceMode: mode,
      shots: [{ beats: [{ start: 0, end: 15, action: '展示商品' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', status: 'verified', script, videoUrl: '', videoHash: '', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, voices: voice ? [voice] : [sampleVoice] });
    state = { ...state, selectedScriptId: 'script', productName: '当前商品', imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: { ...state.productionPlan, scriptId: 'script', voiceId: voice?.id || '',
        adaptedBeats: [{ index: 0, subject: '商品', action: '展示商品', spokenLine: text, subtitle: '' }] } };
    Render(); await settle(); return Render();
  }

  it('does not silently select a recommended voice and blocks speech without an explicit choice', async () => {
    const production = await prepare('speech', null);
    expect(production.rankedVoices).toHaveLength(1);
    expect(production.selectedVoice).toBeNull();
    expect(state.productionPlan.voiceId).toBe('');
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('先选择本次使用的人声');
    await Render().runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
    expect(Render().error).toContain('选择有效的人声');
  });

  it('keeps voice selection empty when a script is first applied instead of accepting the first recommendation', async () => {
    await prepare('speech', null);
    state.productionPlan = { ...state.productionPlan, scriptId: 'previous-script' };
    Render();
    expect(state.productionPlan.scriptId).toBe('script');
    expect(state.productionPlan.voiceId).toBe('');
  });

  it('submits the selected sample audio with speech and preserves full storyboard dialogue', async () => {
    const production = await prepare();
    expect(production.assembled!.audios).toEqual(['/chosen-sample.mp3']);
    expect(production.assembled!.enginePrompt).toContain(sampleVoice.name);
    expect(production.assembled!.enginePrompt.split('这是本次完整的商品介绍台词。')).toHaveLength(2);
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ audios: ['/chosen-sample.mp3'], generateAudio: true }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
    await Render().runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
  });

  it.each([undefined, true, false])('passes the chosen Context IR flag through the actual production workflow (%s)', async (videoContextIrEnabled) => {
    await prepare();
    Render().patchPlan({ videoContextIrEnabled });
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ contextIrEnabled: videoContextIrEnabled ?? true }),
      expect.any(Function), expect.any(AbortSignal), expect.any(Function));
  });

  it.each(['speech', 'voiceover'] as const)('blocks paid video and voiceover synthesis after semantic rejection in %s mode, preserving the manual draft', async (mode) => {
    await prepare(mode, sampleVoice, '防风，风大出门');
    const original = structuredClone(state.productionPlan.adaptedBeats);
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValue(new Error('口播语义验收未通过：第1段句意不完整'));
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('句意不完整');
    await Render().runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
    expect(state.productionPlan.adaptedBeats).toEqual(original);
    expect(state.productionPlan.spokenReviewSourceKey).toBe('');
  });

  it('reviews changed manual words again before submitting while reusing the receipt for an unchanged draft', async () => {
    await prepare();
    await Render().runGenerateVideo();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    const originalReceipt = state.productionPlan.spokenReviewSourceKey;
    expect(originalReceipt).not.toBe('');
    await Render().runGenerateVideo();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    Render().updateAdaptedBeat(0, { spokenLine: '这是我改过以后完整的商品介绍。' });
    Render();
    await Render().runGenerateVideo();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0]).toMatchObject({ reviewOnly: true,
      beats: [expect.objectContaining({ spokenLine: '这是我改过以后完整的商品介绍。' })] });
    expect(submitAndPollSalesVideo).toHaveBeenCalledTimes(3);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(submitAndPollSalesVideo).mock.invocationCallOrder[2]);
    expect(vi.mocked(submitAndPollSalesVideo).mock.lastCall![0].prompt).toContain('这是我改过以后完整的商品介绍。');
    expect(state.productionPlan.spokenReviewSourceKey).not.toBe(originalReceipt);
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe('这是我改过以后完整的商品介绍。');
  });

  it('retains semantic approval after upstream failure and reuses it when retrying with another model', async () => {
    await prepare();
    const original = structuredClone(state.productionPlan.adaptedBeats);
    vi.mocked(submitAndPollSalesVideo).mockImplementationOnce(async () => {
      expect(Render().busy).toBe('video');
      throw new Error('invalid images parameter');
    });
    await Render().runGenerateVideo();
    expect(Render().error).toContain('invalid images parameter');
    expect(state.productionPlan.spokenReviewSourceKey).not.toBe('');
    const current = Render();
    current.patchPlan(salesVideoModelPatch('doubao-seedance-2.0-mini', {
      plan: state.productionPlan, script: current.activeScript!.script,
      references: current.assembled!.references, audios: current.assembled!.audios,
    }));
    await Render().runGenerateVideo();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
    expect(submitAndPollSalesVideo).toHaveBeenCalledTimes(2);
    expect(state.productionPlan.adaptedBeats).toEqual(original);
    expect(state.productionPlan.generatedVideoUrl).toBe('/generated.mp4');
  });

  it('submits Mini dialogue in storyboard order without enforcing a speech window per action', async () => {
    await prepare('speech', { ...sampleVoice, promptText: '你好，欢迎来到今天的试听。' });
    Render().patchPlan({ videoModel: 'doubao-seedance-2.0-mini' });
    const production = Render();
    expect(production.assembled!.enginePrompt).toContain('不限定逐句口播时间');
    expect(production.assembled!.enginePrompt).not.toContain('欢迎来到今天的试听');
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({
      model: 'doubao-seedance-2.0-mini', audios: ['/chosen-sample.mp3'],
      prompt: expect.stringContaining('按动作段顺序自然衔接'), generateAudio: true,
    }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
  });

  it('requires explicit synthesis when the selected voice has no sample and sends only a short reference to TTS', async () => {
    const text = '这是本次口播的完整台词，需要保持分镜中的全部内容。'.repeat(3);
    await prepare('speech', { ...sampleVoice, sampleAudioUrl: '' }, text);
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
    expect(Render().error).toContain('音色参考');
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValue({ audioUrl: '/synthesized-reference.mp3', taskId: 'voice-task' });
    await Render().runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).toHaveBeenCalledWith(expect.objectContaining({ voice: 'voice-code', text: '你好，这是一段人声音色参考，请保持自然清晰的说话方式。' }), expect.any(AbortSignal), expect.any(Function));
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe(text);
    expect(Render().assembled!.enginePrompt).toContain(text);
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ audios: ['/synthesized-reference.mp3'], generateAudio: true }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
  });

  it.each(['真好看', '真，好，看！！！……', '一二三四五六七八九十甲！！！', '完整的商品口播台词需要持续修改，不应重复生成声音样本。'])('uses a fixed neutral sample without replacing the real dialogue: %s', async (text) => {
    const production = await prepare('speech', { ...sampleVoice, sampleAudioUrl: '' }, text);
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValue({ audioUrl: '/reference.mp3', taskId: 'voice-task' });
    await production.runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).toHaveBeenCalledWith(expect.objectContaining({ text: '你好，这是一段人声音色参考，请保持自然清晰的说话方式。' }), expect.any(AbortSignal), expect.any(Function));
    expect(state.productionPlan.adaptedBeats[0].spokenLine).toBe(text);
    expect(Render().assembled!.narrationText).toBe(text);
    expect(Render().assembled!.enginePrompt).toContain(text);
  });

  it.each(['', 'speech'] as const)('reuses synthesized speech references after dialogue edits (override=%s)', async (override) => {
    await prepare('speech', { ...sampleVoice, sampleAudioUrl: '' });
    Render().patchPlan({ voiceModeOverride: override });
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValue({ audioUrl: '/reference.mp3', taskId: 'voice-task' });
    await Render().runSynthesizeVoice();
    Render().updateAdaptedBeat(0, { spokenLine: '换成新的商品介绍台词，继续使用同一个声音。' });
    const updated = Render();
    expect(state.productionPlan.voiceoverAudioUrl).toBe('/reference.mp3');
    expect(updated.assembled!.audios).toEqual(['/reference.mp3']);
    await updated.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ audios: ['/reference.mp3'], prompt: expect.stringContaining('换成新的商品介绍台词'), generateAudio: true }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
    expect(synthesizeSalesVoiceover).toHaveBeenCalledTimes(1);
  });

  it('can prepare a reusable speech reference before writing the storyboard dialogue', async () => {
    const production = await prepare('speech', { ...sampleVoice, sampleAudioUrl: '' }, '');
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValue({ audioUrl: '/reference.mp3', taskId: 'voice-task' });
    await production.runSynthesizeVoice();
    expect(state.productionPlan.voiceoverAudioUrl).toBe('/reference.mp3');
    expect(synthesizeSalesVoiceover).toHaveBeenCalledWith(expect.objectContaining({ text: '你好，这是一段人声音色参考，请保持自然清晰的说话方式。' }), expect.any(AbortSignal), expect.any(Function));
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('分镜台词');
  });

  it('retains a removed selected voice and never switches to a recommendation on refresh', async () => {
    await prepare();
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, voices: [{ ...sampleVoice, id: 'recommended', name: '另一个人声' }] });
    Render(1); await settle();
    const production = Render(1);
    expect(state.productionPlan.voiceId).toBe(sampleVoice.id);
    expect(production.selectedVoice).toBeNull();
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render(1).error).toContain('原选择失效');
  });

  it('does not require voice selection or transport reference audio for pure visual mode', async () => {
    const production = await prepare('none', null);
    expect(production.assembled!.audios).toEqual([]);
    await production.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledWith(expect.objectContaining({ audios: [], generateAudio: false }), expect.any(Function), expect.any(AbortSignal), expect.any(Function));
  });

  it('keeps complete narration for voiceover TTS and excludes it from video audio references', async () => {
    const text = '这是需要完整生成的后期旁白。'.repeat(5);
    const production = await prepare('voiceover', { ...sampleVoice, sampleAudioUrl: '' }, text);
    vi.mocked(synthesizeSalesVoiceover).mockResolvedValue({ audioUrl: '/narration.mp3', taskId: 'voice-task' });
    await production.runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).toHaveBeenCalledWith(expect.objectContaining({ voice: 'voice-code', text }), expect.any(AbortSignal), expect.any(Function));
    expect(Render().assembled!.audios).toEqual([]);
  });

  it('does not synthesize using a fallback voice when the chosen asset lacks a synthesis identifier', async () => {
    const production = await prepare('voiceover', { ...sampleVoice, voiceId: '', ttsVoice: '', sampleAudioUrl: '' });
    await production.runSynthesizeVoice();
    expect(synthesizeSalesVoiceover).not.toHaveBeenCalled();
    expect(Render().error).toContain('没有合成音色标识');
  });
});


