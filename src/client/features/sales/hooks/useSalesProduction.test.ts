import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptSalesScriptPlan, fetchSalesStudioAssets, submitAndPollSalesVideo, uploadSalesCustomAsset, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { listSalesScripts, type StoredSalesScript } from '../api/salesScripts';
import { parseSalesProductionPlan, planForSelectedScript } from '../model/salesProductionDraft';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { useSalesProduction } from './useSalesProduction';
import { salesSummarySource } from '../model/salesSummary';
import { salesPlanAdaptationSourceKey } from '../model/salesPlanSource';
import { listSalesPrompts } from '../api/salesPrompts';
import { adaptSalesSpokenCopy } from '../api/salesSpokenCopy';
import { prepareSalesDepthVideoClip } from '../api/salesVideoClip';

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

let state: SalesCollectionState;
const onChange = (patch: Partial<SalesCollectionState>) => { state = { ...state, ...patch }; };
const catalog: SalesStudioAssetCatalog = { personas: [], scenes: [], actions: [], voices: [], bgms: [] };
const currentPrompt = { id: 'plan-adapt', title: '商品分镜改编', description: '', prompt: '当前规则', defaultPrompt: '默认规则', version: 'test', customized: true, configured: true };
const file = new File(['video'], 'source.mp4', { type: 'video/mp4' }); const finalPrompt = { ...currentPrompt, id: 'final-video', title: '最终视频生成', prompt: '自定义生成规则\n{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', version: 'final-v1' };
const spokenPrompt = { ...currentPrompt, id: 'spoken-copy', title: '口播时长适配', version: 'spoken-v1' };
const reviewPrompt = { ...currentPrompt, id: 'spoken-review', title: '口播语义验收', version: 'review-v1' };
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
  vi.mocked(prepareSalesDepthVideoClip).mockImplementation(async ({ endSec }) => ({ url: '/prepared-depth.mp4', startSec: 0, endSec, durationSec: endSec }));
  vi.mocked(listSalesPrompts).mockResolvedValue([currentPrompt, finalPrompt, { ...finalPrompt, id: 'final-video-depth', version: 'depth-v1' }, spokenPrompt, reviewPrompt]);
  vi.mocked(adaptSalesScriptPlan).mockImplementation(async (input) => ({ beats: input.beats.map((beat) => ({
    index: beat.index, subject: beat.subject || '', action: beat.refAction, expression: beat.expression || '', transition: beat.transition || '', spokenLine: '', subtitle: '',
  })), model: 'text', promptVersion: 'test' }));
  vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => ({ success: true, beats: input.beats.map((beat) => ({
    index: beat.index, spokenLine: beat.spokenLine || '', subtitle: beat.subtitle || '',
  })), model: 'text', promptVersion: spokenPrompt.version, reviewPromptVersion: reviewPrompt.version }));
});
afterEach(unmount);

describe('production work survives library refreshes', () => {
  it('coalesces library return revisions until the production task finishes', async () => {
    Render(); await settle();
    const upload = deferred<string>();
    vi.mocked(uploadSalesCustomAsset).mockReturnValue(upload.promise);
    const request = Render().uploadCustomSlot('rawVideo', file);
    const signal = vi.mocked(uploadSalesCustomAsset).mock.calls[0][2]!;
    expect(Render(1).busy).toBe('upload');
    Render(2).reloadAssets(); Render(2);
    expect(signal.aborted).toBe(false);
    expect(listSalesScripts).toHaveBeenCalledTimes(1);
    expect(fetchSalesStudioAssets).toHaveBeenCalledTimes(1);

    upload.resolve('/current-video.mp4'); await request;
    Render(2); await settle();
    expect(Render(2).busy).toBe('');
    expect(listSalesScripts).toHaveBeenCalledTimes(2);
    expect(fetchSalesStudioAssets).toHaveBeenCalledTimes(2);
    expect(state.productionPlan.generatedVideoUrl).toBe('/current-video.mp4');
  });

  it('discards an interrupted catalog response without clearing the task state, then retries when idle', async () => {
    const oldScripts = deferred<StoredSalesScript[]>();
    const oldCatalog = deferred<SalesStudioAssetCatalog>();
    vi.mocked(listSalesScripts).mockReturnValueOnce(oldScripts.promise);
    vi.mocked(fetchSalesStudioAssets).mockReturnValueOnce(oldCatalog.promise);
    Render();
    const catalogSignal = vi.mocked(fetchSalesStudioAssets).mock.calls[0][0]!;
    const upload = deferred<string>();
    vi.mocked(uploadSalesCustomAsset).mockReturnValue(upload.promise);
    const request = Render().uploadCustomSlot('rawVideo', file);
    const taskSignal = vi.mocked(uploadSalesCustomAsset).mock.calls[0][2]!;
    Render(1);
    expect(catalogSignal.aborted).toBe(true);
    expect(taskSignal.aborted).toBe(false);
    oldScripts.resolve([]); oldCatalog.resolve(catalog); await settle();
    expect(Render(1).busy).toBe('upload');
    upload.resolve('/new.mp4'); await request;
    Render(1); await settle();
    expect(Render(1).busy).toBe('');
    expect(fetchSalesStudioAssets).toHaveBeenCalledTimes(2);
  });

  it('still aborts the production task when the editor truly unmounts', async () => {
    Render(); await settle();
    vi.mocked(uploadSalesCustomAsset).mockImplementation((_file, _category, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
    }));
    const request = Render().uploadCustomSlot('rawVideo', file);
    const signal = vi.mocked(uploadSalesCustomAsset).mock.calls[0][2]!;
    Render(); unmount(); await request;
    expect(signal.aborted).toBe(true);
    expect(state.productionPlan.generatedVideoUrl).toBe('');
  });
});

describe('production script and draft consistency', () => {
  async function prepareScript(status: StoredSalesScript['status'] = 'verified', voiceMode: 'none' | 'speech' = 'speech') {
    const script = normalizeScriptTemplate({ durationSec: 5, voiceMode, shots: [{ beats: [{ start: 0, end: 5, subject: '原片模特', action: '展示商品' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', videoUrl: '', videoHash: '',
      status, script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    state = { ...state, selectedScriptId: 'script', imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: { ...state.productionPlan, scriptId: 'script', generatedVideoUrl: '/video.mp4', mixedVideoUrl: '/final.mp4' } };
    Render(); await settle(); return Render();
  }

  it('preserves the first subtitle edit and finished media through saving and rendering', async () => {
    const prod = await prepareScript();
    const previousPrompt = prod.assembled!.enginePrompt;
    prod.updateAdaptedBeat(0, { subtitle: '修订字幕' });
    state.productionPlan = parseSalesProductionPlan(JSON.parse(JSON.stringify(state.productionPlan)));
    const updated = Render(); Render();
    expect(updated.assembled!.enginePrompt).toBe(previousPrompt);
    expect(updated.assembled!.subtitles[0].text).toBe('修订字幕');
    expect(state.productionPlan).toMatchObject({ generatedVideoUrl: '/video.mp4', mixedVideoUrl: '/final.mp4' });
    expect(state.productionPlan.adaptedBeats).toHaveLength(1);
  });

  it.each(['手掌贴在当前商品正面', ''])('keeps edited motion and subject %j through reload and subsequent product copy rewrites', async (subject) => {
    await prepareScript('verified', 'none');
    state.productName = '当前商品';
    const source = Render().activeScript!.script.shots[0].beats[0];
    source.expression = '原脚本微笑'; source.transition = '原脚本收势';
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(0, { action: '抬手后停在肩高', expression: '', transition: '手动放松收势', subject });
    state.productionPlan = parseSalesProductionPlan(JSON.parse(JSON.stringify(state.productionPlan)));
    state.productName = '更换后的商品';
    await Render().runPlanAdapt('text');
    const request = vi.mocked(adaptSalesScriptPlan).mock.lastCall![0];
    expect(request.beats[0]).toMatchObject({ refAction: '抬手后停在肩高', expression: '', transition: '手动放松收势', subject });
    expect(JSON.stringify(request)).not.toContain('manualPerformanceFields');
    expect(state.productionPlan.adaptedBeats[0]).toMatchObject({ action: '抬手后停在肩高', expression: '',
      transition: '手动放松收势', subject, manualPerformanceFields: ['action', 'expression', 'transition', 'subject'] });
    expect(source.subject).toBe('原片模特');
    expect(Render().assembled!.enginePrompt).toContain('动作描述：抬手后停在肩高');

    Render().updateAdaptedBeat(0, { action: '' });
    await Render().runPlanAdapt('text');
    expect(vi.mocked(adaptSalesScriptPlan).mock.lastCall![0].beats[0].refAction).toBe('展示商品');
    expect(state.productionPlan.adaptedBeats[0]).toMatchObject({ action: '展示商品', expression: '',
      transition: '手动放松收势', subject, manualPerformanceFields: ['expression', 'transition', 'subject'] });
  });

  it('does not reintroduce hidden source subject and performance after the current action is edited', async () => {
    await prepareScript('verified', 'none');
    state.productName = '单层冲锋衣';
    const source = Render().activeScript!.script.shots[0].beats[0];
    Object.assign(source, { subject: '内部配件', expression: '低头看内胆', transition: '手指离开内胆' });
    await Render().runPlanAdapt('text');
    Render().updateAdaptedBeat(0, { action: '双手轻揉外层面料后自然放松' });
    state.productionPlan = parseSalesProductionPlan(JSON.parse(JSON.stringify(state.productionPlan)));
    await Render().runPlanAdapt('text');
    expect(vi.mocked(adaptSalesScriptPlan).mock.lastCall![0].beats[0]).toMatchObject({
      refAction: '双手轻揉外层面料后自然放松', subject: '', expression: '', transition: '',
    });
    expect(state.productionPlan.adaptedBeats[0]).toMatchObject({ subject: '', expression: '', transition: '', manualPerformanceFields: ['action'] });
    expect(source).toMatchObject({ subject: '内部配件', expression: '低头看内胆', transition: '手指离开内胆' });
  });

  it('prevents submission of a previously selected script returned to draft review', async () => {
    const prod = await prepareScript('draft');
    await prod.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('尚未确认入库');
  });
  it('adapts from the latest edited final points and copy and detects later edits', async () => {
    await prepareScript();
    state.productSummary = { inputKey: salesSummarySource(state).inputKey, generatedAt: '', model: 'vision', skillVersion: 'v3', editedCopy: '用户最新口播',
      result: { summary: '用户最新概括', points: [{ benefit: '用户最新买点', feature: '已纠正面料', expression: '用户最新表达', sources: ['image-1'] }, { benefit: '', feature: '', expression: '', sources: ['image-1'] }], copy: '旧口播', copyPointIndexes: [1], conflicts: [], questions: [], cautions: [] } };
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ beats: [{ index: 0, subject: '商品', action: '展示当前商品', spokenLine: '新台词', subtitle: '' }], model: 'text', promptVersion: 'v3' });
    await Render().runPlanAdapt('text');
    const request = vi.mocked(adaptSalesScriptPlan).mock.calls[0][0];
    expect(request).toMatchObject({ summary: '用户最新概括', buyingPoints: ['用户最新买点；已纠正面料；用户最新表达'] });
    expect(request.facts).not.toContain('用户最新口播');
    expect(request.facts).not.toContain('旧口播');
    expect(adaptSalesSpokenCopy).toHaveBeenCalledWith(expect.objectContaining({ sourceCopy: '用户最新口播', voiceMode: 'speech', duration: 5,
      beats: [expect.objectContaining({ index: 0, start: 0, end: 5, action: '展示当前商品', purpose: 'showcase', buyingPoint: '', subject: '商品', shotIndex: 0, shotSize: '中景', camera: '', spokenLine: '新台词', subtitle: '', sourceVoiceText: '', sourceLinePattern: '', sourceSubtitle: '' })] }), 'text', expect.any(AbortSignal));
    expect(state.productionPlan).toMatchObject({ adaptedPromptVersion: 'v3', spokenCopyPromptVersion: 'spoken-v1', spokenReviewPromptVersion: 'review-v1' });
    expect(state.productionPlan.spokenCopySourceKey).not.toBe('');
    expect(Render().generationSourceError).toBe('');
    state = { ...state, productSummary: { ...state.productSummary!, editedCopy: '再次编辑口播' } };
    expect(Render().generationSourceError).toContain('商品资料已更新');
  });

  it('offers library voices when a silent script is changed to narrated production', async () => {
    const voice = { id: 'voice', name: '旁白音色', voiceId: 'narrator', ttsVoice: 'narrator', gender: 'female', tags: [], sampleAudioUrl: '', promptText: '', source: 'voice_library' };
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, voices: [voice] });
    const prod = await prepareScript('verified', 'none');
    expect(prod.rankedVoices).toHaveLength(0);
    prod.setVoiceMode('voiceover');
    expect(Render().rankedVoices.map((candidate) => candidate.item.id)).toEqual(['voice']);
    Render().setPresentationMode('subtitled_intro');
    expect(Render().assembled!.effectiveVoiceMode).toBe('voiceover');
  });

  it('enables speech for a silent script only after explicitly choosing selling-point narration', async () => {
    const prod = await prepareScript('verified', 'none');
    expect(prod.assembled!.effectiveVoiceMode).toBe('none');
    expect(state.productionPlan).toMatchObject({ voiceModeOverride: '', generatedVideoUrl: '/video.mp4' });
    prod.setPresentationMode('subtitled_intro');
    expect(state.productionPlan).toMatchObject({ presentationMode: 'subtitled_intro', voiceModeOverride: 'speech', generatedVideoUrl: '' });
    expect(Render().assembled!.effectiveVoiceMode).toBe('speech');
  });
});

describe('linked script videos in generation requests', () => {
  async function prepareReference(mode: 'none' | 'depth' | 'source' | 'manual', depthVideoUrl = '/linked-depth.mp4') {
    const script = normalizeScriptTemplate({ durationSec: 5, format: 'product', voiceMode: 'none', sourceExclusions: [{ term: '原开衫、原外套', type: 'product' }, { term: '原片模特', type: 'person_appearance' }], shots: [{ beats: [
      { start: 0, end: 2.5, action: '走近商品' }, { start: 2.5, end: 5, action: '展示商品' },
    ] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'linked', title: '商品展示', videoUrl: '/original.mp4', depthVideoUrl, videoHash: '',
      status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    state = { ...state, productName: '当前商品', selectedScriptId: 'linked', imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: parseSalesProductionPlan({ ...state.productionPlan, scriptId: 'linked',
        scriptVideoReference: mode === 'manual' ? 'none' : mode, imitationMode: mode === 'none' ? 'script_only' : 'depth_imitation', beatActionIds: { 0: 'old-action' } }) };
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, actions: [{ id: 'old-action', title: '旧逐镜素材', action: '旧素材动作',
      shotType: '', camera: '', tags: '', coverUrl: '', mediaUrl: '/old-action.mp4', mediaType: 'depth-video' }] });
    vi.mocked(submitAndPollSalesVideo).mockResolvedValue({ videoUrl: '/generated.mp4', taskId: 'task' });
    Render(); await settle(); return Render();
  }

  it.each([
    ['none', []], ['depth', ['/prepared-depth.mp4']], ['source', []], ['manual', []],
  ] as const)('submits the selected %s reference once alongside product images', async (mode, videos) => {
    const prod = await prepareReference(mode);
    await prod.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    const request = vi.mocked(submitAndPollSalesVideo).mock.calls[0][0];
    expect(request.images).toEqual(['/product.jpg']);
    expect(request.videos).toEqual(videos);
    if (videos.length) {
      expect(request.prompt.match(/动作参考：@视频1/g)).toHaveLength(1);
      expect(request.prompt).toContain('源片对应时间 00:02.5 - 00:05');
    } else expect(request.prompt).not.toContain('动作参考：');
  });

  it('blocks missing linked depth instead of silently submitting an image-only request', async () => {
    const prod = await prepareReference('depth', '');
    await prod.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(Render().error).toContain('关联深度视频尚未就绪');
  });

  it('clears linked reference selection and old outputs when selecting another script', async () => {
    await prepareReference('depth');
    const next = planForSelectedScript({ ...state.productionPlan, generatedVideoUrl: '/old.mp4', mixedVideoUrl: '/old-final.mp4' }, 'other');
    expect(next).toMatchObject({ scriptVideoReference: 'none', imitationMode: 'script_only', generatedVideoUrl: '', mixedVideoUrl: '', beatActionIds: {} });
    expect(parseSalesProductionPlan({ scriptVideoReference: 'source' }).scriptVideoReference).toBe('none');
    expect(parseSalesProductionPlan({}).scriptVideoReference).toBe('none');
  });

  it.each(['depth', 'source', 'manual'] as const)('keeps %s adaptation aligned with the supported motion source', async (mode) => {
    const prod = await prepareReference(mode);
    await prod.runPlanAdapt('text-model');
    const request = vi.mocked(adaptSalesScriptPlan).mock.calls[0][0];
    expect(request).toMatchObject({ imitationMode: mode === 'depth' ? 'depth_imitation' : 'script_only', sourceExclusions: [{ term: '原开衫', type: 'product' }, { term: '原外套', type: 'product' }, { term: '原片模特', type: 'person_appearance' }] });
    if (mode === 'depth') expect(request.beats[1].actionReference).toBe('此脚本关联深度视频的 2.5—5 秒动作');
    else expect(request.beats.every((beat) => !beat.actionReference)).toBe(true);
  });

  it('ignores legacy per-beat media even before a running plan is reloaded', async () => {
    await prepareReference('manual');
    state.productionPlan = { ...state.productionPlan, imitationMode: 'depth_imitation' };
    const prod = Render();
    expect(prod.assembled!.imitationMode).toBe('script_only');
    await prod.runGenerateVideo();
    expect(vi.mocked(submitAndPollSalesVideo).mock.calls[0][0].videos).toEqual([]);
  });


});


describe('optional selling points after product facts change', () => {
  async function prepareStaleSummary() {
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, voices: [{ id: 'voice', name: '当前人声', voiceId: 'voice', ttsVoice: 'voice', gender: 'female', tags: [], sampleAudioUrl: '/voice.mp3', promptText: '', source: 'voice_library' }] });
    const script = normalizeScriptTemplate({ durationSec: 5, format: 'product',
      visualSpec: { oneTake: true, styleSummary: '手机实拍，保留皮肤与织物细节', lighting: '窗边侧光', cameraFeel: '固定机位', pacing: 'slow' },
      shots: [{ beats: [{ start: 0, end: 5, action: '展示商品', subject: '手握商品边缘', scene: '侧光窗边', transition: '松手停留后回落', expression: '视线跟随手部' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'script', title: '商品展示', videoUrl: '', videoHash: '',
      status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    state = { ...state, productName: '衬衫', props: { 成分: '棉' }, selectedScriptId: 'script',
      imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: { ...state.productionPlan, scriptId: 'script', voiceId: 'voice',
        adaptedBeats: [{ index: 0, subject: '棉衬衫', action: '展示棉衬衫', spokenLine: '棉面料', subtitle: '棉', manualPerformanceFields: [] }] } };
    state.productSummary = { inputKey: 'legacy-image-summary-source', generatedAt: new Date().toISOString(), model: 'vision', skillVersion: 'test',
      result: { summary: '旧棉面料卖点', points: [], copy: '', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] } };
    state.props = { 成分: '亚麻' };
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ beats: [{ index: 0, subject: '亚麻衬衫', action: '展示亚麻衬衫', expression: '视线跟随当前商品', transition: '松手停留后回落', spokenLine: '亚麻面料', subtitle: '亚麻' }], model: 'text', promptVersion: 'test' });
    vi.mocked(submitAndPollSalesVideo).mockResolvedValue({ videoUrl: '/new.mp4', taskId: 'new-task' });
    Render(); await settle(); return Render();
  }

  it('blocks old narration but allows a successful adaptation from new facts without paying to extract selling points again', async () => {
    let prod = await prepareStaleSummary();
    expect(prod.generationSourceError).toContain('重新自动适配');
    await prod.runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    await Render().runPlanAdapt('text-model');
    expect(adaptSalesScriptPlan).toHaveBeenCalledWith(expect.objectContaining({ facts: '成分：亚麻', summary: '', buyingPoints: [] }), 'text-model', expect.any(AbortSignal));
    expect(vi.mocked(adaptSalesScriptPlan).mock.calls[0][0]).toMatchObject({
      visualSpec: { oneTake: true, styleSummary: '手机实拍，保留皮肤与织物细节', lighting: '窗边侧光', cameraFeel: '固定机位', pacing: 'slow' },
      beats: [{ subject: '手握商品边缘', scene: '侧光窗边', transition: '松手停留后回落', expression: '视线跟随手部' }],
    });
    expect(state.productionPlan.adaptedSourceKey).toBe(salesPlanAdaptationSourceKey(state, Render().activeScript!.script, Render().selectedScene));
    expect(state.productionPlan.adaptedPromptVersion).toBe('test');
    state.productionPlan = parseSalesProductionPlan(JSON.parse(JSON.stringify(state.productionPlan)));
    state.productionPlan.personaId = 'unused-person-for-product-only-script';
    prod = Render();
    expect(prod.generationSourceError).toBe('');
    await prod.runGenerateVideo();
    expect(submitAndPollSalesVideo).toHaveBeenCalledOnce();
    const request = vi.mocked(submitAndPollSalesVideo).mock.calls[0][0];
    expect(request.prompt).toContain('亚麻面料');
    expect(request.prompt).not.toContain('棉面料');
  });

  it('does not mark a failed adaptation as current and blocks again when product facts change after success', async () => {
    await prepareStaleSummary();
    vi.mocked(adaptSalesScriptPlan).mockRejectedValueOnce(new Error('改编失败'));
    await Render().runPlanAdapt('text-model');
    expect(state.productionPlan.adaptedSourceKey).toBe('');
    expect(state.productionPlan.adaptedPromptVersion).toBe('');
    expect(Render().generationSourceError).toContain('重新自动适配');
    await Render().runPlanAdapt('text-model');
    expect(Render().generationSourceError).toBe('');
    state = { ...state, props: { 成分: '羊毛' } };
    expect(Render().generationSourceError).toContain('重新自动适配');
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(planForSelectedScript(state.productionPlan, 'different-script').adaptedSourceKey).toBe('');
  });
});

describe('chosen and uploaded persona identity', () => {
  const personas = ['first', 'chosen'].map((id) => ({ id, name: `人物${id}`, description: '', tags: id === 'chosen' ? '清冷、自信' : '亲和', avatarUrl: `/${id}-face.jpg`,
    fullBodyUrl: `/${id}-body.jpg`, faceUrl: `/${id}-face.jpg`, sourceImages: [], hasReferenceImage: true, source: 'persona_library' }));
  async function preparePersona() {
    const script = normalizeScriptTemplate({ title: '人物展示', durationSec: 5, voiceMode: 'none', shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    vi.mocked(listSalesScripts).mockResolvedValue([{ id: 'people', title: script.title, videoUrl: '', videoHash: '', status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' }]);
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, personas });
    state = { ...state, productName: '衬衫', selectedScriptId: 'people', imageCatalog: [{ index: 0, url: '/product.jpg', role: 'main' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      productionPlan: { ...state.productionPlan, scriptId: 'people', personaId: 'chosen' } };
    Render(); await settle(); return Render();
  }

  it('uploads an independent custom identity, labels it correctly and clears it on explicit library selection', async () => {
    const prod = await preparePersona();
    expect(prod.selectedPersona?.id).toBe('chosen');
    vi.mocked(uploadSalesCustomAsset).mockResolvedValue('/custom-body.jpg');
    await prod.uploadCustomSlot('personaBody', file);
    const custom = Render();
    expect(state.productionPlan.personaId).toBe('');
    expect(custom.selectedPersona).toBeNull();
    expect(custom.assembled!.references.filter((ref) => ref.kind.startsWith('persona')).map((ref) => ref.url)).toEqual(['/custom-body.jpg']);
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ beats: [{ index: 0, subject: '自定义人物', action: '展示衬衫', spokenLine: '', subtitle: '' }], model: 'test', promptVersion: 'test' });
    await custom.runPlanAdapt('text-model');
    expect(vi.mocked(adaptSalesScriptPlan).mock.calls[0][0].personaSummary).toContain('用户上传的自定义出镜人物');
    Render().selectPersona('first');
    expect(Render().selectedPersona?.id).toBe('first');
    expect(state.productionPlan).toMatchObject({ customPersonaBodyUrl: '', customPersonaFaceUrl: '' });
    expect(Render().generationSourceError).toContain('出镜人物已变更');
    await Render().runGenerateVideo();
    expect(submitAndPollSalesVideo).not.toHaveBeenCalled();
    expect(state.productionPlan.adaptedBeats[0].subject).toBe('自定义人物');
  });

  it('explicit smart matching replaces uploaded anchors with the chosen recommended identity', async () => {
    await preparePersona();
    state.productionPlan = { ...state.productionPlan, customPersonaBodyUrl: '/custom-body.jpg', customPersonaFaceUrl: '/custom-face.jpg' };
    expect(Render().selectedPersona).toBeNull();
    Render().applySmartDefaults();
    const matched = Render();
    expect(state.productionPlan).toMatchObject({ personaId: 'first', customPersonaBodyUrl: '', customPersonaFaceUrl: '' });
    expect(matched.assembled!.references.filter((ref) => ref.kind.startsWith('persona')).map((ref) => ref.url)).toEqual(['/first-body.jpg', '/first-face.jpg']);
  });

  it('does not silently switch a missing selected identity to a recommended person after refresh', async () => {
    await preparePersona();
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ ...catalog, personas: [personas[0]] });
    Render(1); await settle();
    expect(Render(1).selectedPersona).toBeNull();
    expect(state.productionPlan.personaId).toBe('chosen');
    expect(Render(1).assembled!.references.some((ref) => ref.kind.startsWith('persona'))).toBe(false);
  });

  it('passes an optional presenter and separate temperament/performance facts through rewriting and final assembly', async () => {
    await preparePersona();
    const scripts = await vi.mocked(listSalesScripts).mock.results[0].value as StoredSalesScript[];
    scripts[0].script.assetSlots.persona.required = false;
    scripts[0].script.assetSlots.persona.styleTags = ['明快、有表现力'];
    Render(1); await settle();
    const personaVisualProfile = { imageUrl: '/chosen-body.jpg', presence: 'silent_model' as const, temperament: '眉眼舒展，清爽',
      gaze: '目光聚焦镜头', expression: '嘴角轻提', posture: '肩线自然', limitations: '静态图片' };
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ beats: [], model: 'test', promptVersion: 'test', personaVisualProfile });
    await Render(1).runPlanAdapt('text-model');
    const { personaSummary } = vi.mocked(adaptSalesScriptPlan).mock.calls[0][0];
    for (const fact of ['人物风格标签：清冷、自信', '原分镜人物风格（仅表演参考）：明快、有表现力']) {
      expect(personaSummary).toContain(fact);
      expect(Render(1).assembled!.enginePrompt).toContain(fact);
    }
    expect(vi.mocked(adaptSalesScriptPlan).mock.calls[0][0]).toMatchObject({ personaReferenceImageUrl: '/chosen-body.jpg', personaPresence: 'silent_model' });
    expect(state.productionPlan.personaVisualProfile).toEqual(personaVisualProfile);
    expect(Render(1).assembled!.enginePrompt).toContain('原图视线：目光聚焦镜头');
  });
});
