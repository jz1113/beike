import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { submitDepthVideo, pollDepthVideoTask } from '@client/shared/api/generation/depthGeneration';
import { analyzeReferenceVideo, fetchScriptAnalysisPrompt, listSalesScripts, patchSalesScript, saveSalesScript, type SalesScriptDraftResult, type StoredSalesScript } from '../api/salesScripts';
import { readSalesDepthReceipt } from '../api/salesDepth';
import { readScriptBundleJob, saveScriptBundleJob, type SalesScriptBundleJob } from '../model/salesScriptBundle';
import { useSalesScriptBundle } from './useSalesScriptBundle';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as (() => unknown)[], paused: [] as SalesScriptBundleJob[], removed: [] as SalesScriptBundleJob[] }));
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect: (effect: () => unknown, dependencies: unknown[]) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) { hooks.slots[index] = dependencies; hooks.effects.push(effect); }
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));
vi.mock('../model/salesScriptBundle', () => ({ readScriptBundleJob: vi.fn(), saveScriptBundleJob: vi.fn(), readPausedScriptBundles: () => hooks.paused, readRemovedScriptBundles: () => hooks.removed, savePausedScriptBundles: (jobs: SalesScriptBundleJob[]) => { hooks.paused = jobs; },
  moveScriptBundleProgress: (record: string | SalesScriptBundleJob, undo = false) => { const id = typeof record === 'string' ? record : record.operationId; const source = undo ? hooks.removed : hooks.paused; const item = typeof record === 'string' ? source.find((entry) => entry.operationId === id) : record;
    hooks.paused = hooks.paused.filter((entry) => entry.operationId !== id); hooks.removed = hooks.removed.filter((entry) => entry.operationId !== id);
    if (item) (undo ? hooks.paused : hooks.removed).push(item); return { jobs: hooks.paused, removed: hooks.removed }; },
  purgeRemovedScriptBundles: (ids: string[]) => { hooks.removed = hooks.removed.filter((entry) => !ids.includes(entry.operationId)); return hooks.removed; } }));
vi.mock('../api/salesScripts', () => ({ analyzeReferenceVideo: vi.fn(), fetchScriptAnalysisPrompt: vi.fn(), listSalesScripts: vi.fn(), patchSalesScript: vi.fn(), saveSalesScript: vi.fn() }));
vi.mock('../api/salesDepth', () => ({ readSalesDepthReceipt: vi.fn(), fetchSalesActionFile: vi.fn() }));
vi.mock('@client/shared/api/generation/depthGeneration', () => ({ submitDepthVideo: vi.fn(), pollDepthVideoTask: vi.fn() }));
const script = normalizeScriptTemplate({ title: '转身', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, action: '转身' }] }] })!;
const item: StoredSalesScript = { id: 'script-a', title: script.title, videoUrl: '/storage/source.mp4', videoHash: 'hash', status: 'draft', script, model: 'model', promptVersion: 'v1', version: 1, useCount: 0, updatedAt: '', analysisCacheEligible: true };
const onAnalysis = vi.fn(); const onSaved = vi.fn();
const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });
const checkpoint: SalesScriptBundleJob = { videoUrl: item.videoUrl, name: '转身', model: 'model', scriptId: item.id,
  operationId: 'original-operation', taskId: 'original-task', resultUrl: '', depthState: 'submitted', analysisError: '', depthError: '' };
function useHarness() {
  hooks.index = 0;
  const result = useSalesScriptBundle({ onAnalysis, onSaved });
  hooks.effects.splice(0).forEach((effect) => effect());
  return result;
}
async function settle() { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = []; hooks.paused = []; hooks.removed = [];
  vi.resetAllMocks();
  vi.mocked(readScriptBundleJob).mockReturnValue(null);
  vi.mocked(listSalesScripts).mockResolvedValue([]);
  vi.mocked(fetchScriptAnalysisPrompt).mockResolvedValue({ success: true, prompt: '当前规则', promptVersion: 'v1' });
  vi.mocked(analyzeReferenceVideo).mockResolvedValue({ script, existingId: item.id, model: 'model', promptVersion: 'v1', videoHash: 'hash' });
  vi.mocked(patchSalesScript).mockImplementation(async (_id, patch) => ({ ...item, ...patch } as StoredSalesScript));
  vi.mocked(submitDepthVideo).mockResolvedValue({ taskId: 'task-a' });
  vi.mocked(pollDepthVideoTask).mockResolvedValue({ status: 'SUCCESS', resultUrl: '/storage/depth.mp4' });
});

describe('combined script and depth import', () => {
  it('reuses a recovered response only when its analysis prompt version is current', async () => {
    vi.mocked(listSalesScripts).mockResolvedValue([{ ...item, id: 'old-script', promptVersion: 'v0', status: 'verified' }, item]);
    vi.mocked(analyzeReferenceVideo).mockResolvedValueOnce({script, existingId: item.id, model: 'model', promptVersion:'v1', videoHash:'hash', cached:true});
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(onAnalysis).toHaveBeenCalledWith(expect.objectContaining({ existingId: item.id, promptVersion: 'v1', cached: true }), item.videoUrl);
    expect(patchSalesScript).not.toHaveBeenCalledWith('old-script', expect.anything());
  });
  it('analyzes again when only a previous prompt version is stored, preserving the older script', async () => {
    vi.mocked(listSalesScripts).mockResolvedValue([{ ...item, id: 'old-script', promptVersion: 'v0', status: 'verified' }]);
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(onAnalysis).toHaveBeenCalledWith(expect.objectContaining({ existingId: item.id, promptVersion: 'v1' }), item.videoUrl);
    expect(patchSalesScript).not.toHaveBeenCalledWith('old-script', expect.anything());
  });
  it('does not fall back to an existing script when current prompt settings cannot be read', async () => {
    vi.mocked(listSalesScripts).mockResolvedValue([item]);
    vi.mocked(analyzeReferenceVideo).mockRejectedValue(new Error('提示词设置暂不可用'));
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(onAnalysis).not.toHaveBeenCalled();
    expect(useHarness().job).toMatchObject({ scriptId: '', analysisError: '提示词设置暂不可用' });
  });
  it('delegates malformed or unvalidated current-version cache to the backend without forcing another paid analysis', async () => {
    vi.mocked(listSalesScripts).mockResolvedValue([
      { ...item, id: 'malformed-script', analysisCacheEligible: false, status: 'verified' },
      { ...item, id: 'unvalidated-script', analysisCacheEligible: undefined, status: 'verified' },
    ]);
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledExactlyOnceWith(item.videoUrl, 'model', expect.any(AbortSignal), false, true, expect.any(String));
    expect(onAnalysis).toHaveBeenCalledWith(expect.objectContaining({ existingId: item.id }), item.videoUrl);
    expect(patchSalesScript).not.toHaveBeenCalledWith('malformed-script', expect.anything());
    expect(patchSalesScript).not.toHaveBeenCalledWith('unvalidated-script', expect.anything());
  });
  it('only completes depth for an explicitly selected stored script regardless of its prompt version', async () => {
    const stored = { ...item, promptVersion: 'v0', status: 'verified' as const };
    vi.mocked(fetchScriptAnalysisPrompt).mockRejectedValue(new Error('设置暂不可用'));
    useHarness().start(item.videoUrl, '转身', 'model', file, stored); await settle();
    expect(fetchScriptAnalysisPrompt).not.toHaveBeenCalled();
    expect(analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    expect(patchSalesScript).toHaveBeenCalledWith(item.id, expect.objectContaining({ depthVideoUrl: '/storage/depth.mp4' }));
    expect(vi.mocked(patchSalesScript).mock.calls.every(([, patch]) => !patch.script && !patch.status)).toBe(true);
  });
  it('keeps an old linked depth visible until an explicitly restarted conversion succeeds', async () => {
    let stored = { ...item, depthVideoUrl: '/storage/old-depth.mp4', depthTaskId: 'old-task', depthOperationId: 'old-operation' };
    vi.mocked(patchSalesScript).mockImplementation(async (_id, patch) => { stored = { ...stored, ...patch }; return stored; });
    let finish!: (value: Awaited<ReturnType<typeof pollDepthVideoTask>>) => void;
    vi.mocked(pollDepthVideoTask).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    useHarness().start(stored.videoUrl, stored.title, stored.model, file,
      { ...stored, depthVideoUrl: '', depthTaskId: '', depthOperationId: '' });
    await settle();
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitDepthVideo).mock.calls[0][4]).not.toBe('old-operation');
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ depthVideoUrl: '/storage/old-depth.mp4' }));
    expect(patchSalesScript).not.toHaveBeenCalledWith(item.id, expect.objectContaining({ depthVideoUrl: '' }));
    finish({ status: 'SUCCESS', resultUrl: '/storage/new-depth.mp4' }); await settle();
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ depthVideoUrl: '/storage/new-depth.mp4' }));
    expect(analyzeReferenceVideo).not.toHaveBeenCalled();
  });
  it('starts both tasks once and links completed results without waiting to review the script', async () => {
    let finish!: (value: Awaited<ReturnType<typeof pollDepthVideoTask>>) => void;
    vi.mocked(pollDepthVideoTask).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    useHarness().start(item.videoUrl, '转身', 'model', file);
    useHarness().start(item.videoUrl, '转身', 'model', file);
    await settle();
    expect(onAnalysis).toHaveBeenCalledTimes(1);
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    expect(useHarness().job?.scriptId).toBe(item.id);
    expect(useHarness().converting).toBe(true);
    finish({ status: 'SUCCESS', resultUrl: '/storage/depth.mp4' }); await settle();
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ depthVideoUrl: '/storage/depth.mp4', videoUrl: item.videoUrl }));
    expect(useHarness().job).toBeNull();
  });
  it('does not submit either task if checkpoint persistence fails, and permits a later start', async () => {
    vi.mocked(saveScriptBundleJob).mockImplementationOnce(() => { throw new Error('quota'); });
    useHarness().start(item.videoUrl, '转身', 'model', file);
    await settle();
    expect(useHarness().job).toBeNull();
    expect(analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(submitDepthVideo).not.toHaveBeenCalled();
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
  });
  it('retains the completed script on depth failure and allows another import after deferring depth', async () => {
    vi.mocked(submitDepthVideo).mockRejectedValueOnce(new Error('深度模型未安装'));
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(useHarness().job).toMatchObject({ scriptId: item.id, depthState: 'failed' });
    expect(onAnalysis).toHaveBeenCalledTimes(1);
    await useHarness().deferDepth();
    expect(useHarness().job).toBeNull();
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ videoUrl: item.videoUrl, depthOperationId: '' }));
    useHarness().start('/storage/next.mp4', '下一条', 'model', file); await settle();
    expect(submitDepthVideo).toHaveBeenCalledTimes(2);
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(2);
  });
  it('queries the original persisted task on remount without repeating analysis or submission', async () => {
    vi.mocked(readScriptBundleJob).mockReturnValue(checkpoint);
    useHarness(); await settle();
    expect(pollDepthVideoTask).toHaveBeenCalledWith('original-task', expect.any(AbortSignal));
    expect(submitDepthVideo).not.toHaveBeenCalled();
    expect(analyzeReferenceVideo).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ depthVideoUrl: '/storage/depth.mp4' }));
  });
  it('reconciles an ambiguous submission using its operation key and never submits again', async () => {
    vi.mocked(readScriptBundleJob).mockReturnValue({ ...checkpoint, taskId: '' });
    vi.mocked(readSalesDepthReceipt).mockResolvedValue({ taskId: 'recovered-task' });
    useHarness(); await settle();
    expect(readSalesDepthReceipt).toHaveBeenCalledWith(true, 'original-operation', expect.any(AbortSignal));
    expect(pollDepthVideoTask).toHaveBeenCalledWith('recovered-task', expect.any(AbortSignal));
    expect(submitDepthVideo).not.toHaveBeenCalled();
  });
  it('keeps a finished depth video while analysis fails, then retries only analysis', async () => {
    vi.mocked(analyzeReferenceVideo).mockRejectedValueOnce(new Error('模型失败'));
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(useHarness().job).toMatchObject({ resultUrl: '/storage/depth.mp4', scriptId: '' });
    await useHarness().retryAnalysis(); await settle();
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    expect(useHarness().job).toBeNull();
  });
  it('only retries a definitively failed depth job and preserves the successful script', async () => {
    vi.mocked(pollDepthVideoTask).mockResolvedValueOnce({ status: 'FAILURE', failReason: '运行失败' });
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(useHarness().job?.depthState).toBe('failed');
    await useHarness().resumeDepth(); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(submitDepthVideo).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(submitDepthVideo).mock.calls;
    expect(calls[0][4]).not.toBe(calls[1][4]);
  });
  it('checkpoints completed analysis and retries saving without another model call', async () => {
    vi.mocked(analyzeReferenceVideo).mockResolvedValue({ script, model: 'model', promptVersion: 'v1', videoHash: 'hash', saveWarning: '保存失败' });
    vi.mocked(saveSalesScript).mockRejectedValueOnce(new Error('数据库暂不可用')).mockResolvedValueOnce(item);
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(useHarness().job?.pendingScript?.script).toEqual(script);
    const saveId = useHarness().job?.pendingScriptId;
    // A settings change after a completed paid analysis must not repeat the model call.
    vi.mocked(fetchScriptAnalysisPrompt).mockResolvedValue({ success: true, prompt: '新规则', promptVersion: 'v2' });
    await useHarness().retryAnalysis(); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(fetchScriptAnalysisPrompt).not.toHaveBeenCalled();
    expect(saveSalesScript).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveSalesScript).mock.calls[1][0]).toMatchObject({ id: saveId, status: 'verified' });
    expect(vi.mocked(saveSalesScript).mock.calls[1][0].promptVersion).toBe('v1');
    expect(useHarness().job).toBeNull();
  });
  it('does not mark an unsubmitted job submitted when the pre-submit checkpoint fails', async () => {
    vi.mocked(saveScriptBundleJob).mockImplementation((job) => { if (job?.depthState === 'submitted') throw new Error('quota'); });
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    expect(submitDepthVideo).not.toHaveBeenCalled();
    expect(useHarness().job?.depthState).toBe('prepared');
  });
  it('allows switching the analysis model after a partial failure', async () => {
    vi.mocked(analyzeReferenceVideo).mockRejectedValueOnce(new Error('模型不支持'));
    useHarness().start(item.videoUrl, '转身', 'wrong-model', file); await settle();
    await useHarness().retryAnalysis('new-model'); await settle();
    expect(vi.mocked(analyzeReferenceVideo).mock.calls[1][1]).toBe('new-model');
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
  });

  it('can pause an unsaved analysis with completed depth and restore without repeating either task', async () => {
    vi.mocked(analyzeReferenceVideo).mockResolvedValue({ script, model: 'model', promptVersion: 'v1', videoHash: 'hash' });
    vi.mocked(saveSalesScript).mockRejectedValueOnce(new Error('数据库暂不可用')).mockResolvedValueOnce(item);
    useHarness().start(item.videoUrl, '转身', 'model', file); await settle();
    useHarness().pause();
    expect(useHarness().job).toBeNull();
    const saved = useHarness().paused[0];
    expect(saved.pendingScript?.script).toEqual(script);
    expect(saved.resultUrl).toBe('/storage/depth.mp4');
    await useHarness().restore(saved);
    await useHarness().retryAnalysis(); await settle();
    expect(analyzeReferenceVideo).toHaveBeenCalledTimes(1);
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    expect(useHarness().job).toBeNull();
    expect(useHarness().paused).toEqual([]);
  });
  it('retains the active job when clearing its checkpoint during pause fails', () => {
    const pending = { ...checkpoint, depthState: 'prepared' as const, scriptId: '' };
    vi.mocked(readScriptBundleJob).mockReturnValue(pending);
    vi.mocked(saveScriptBundleJob).mockImplementation((job) => { if (!job) throw new Error('quota'); });
    useHarness().pause();
    expect(useHarness().job).toEqual(pending);
    expect(useHarness().error).toContain('无法暂存进度');
    expect(useHarness().paused).toEqual([]);
  });
  it('removes active progress, ignores late analysis, and restores the checkpoint on undo', async () => {
    let finish!: (value: SalesScriptDraftResult) => void;
    vi.mocked(analyzeReferenceVideo).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    useHarness().start(item.videoUrl, '转身', 'model', file);
    await settle();
    const snapshot = useHarness().job!;
    useHarness().removeCurrent(snapshot.operationId);
    expect(saveScriptBundleJob).toHaveBeenLastCalledWith(null);
    finish({ script, existingId: item.id, model: 'model', promptVersion: 'v1', videoHash: 'hash' });
    await settle();
    expect(useHarness().job).toBeNull();
    expect(useHarness().removed).toEqual([snapshot]);
    expect(onAnalysis).not.toHaveBeenCalled();
    useHarness().undoRemovePaused(snapshot.operationId);
    expect(useHarness().paused).toEqual([snapshot]);
  });
  it('removes only the selected paused job and allows undo without touching saved scripts', () => {
    const other = { ...checkpoint, operationId: 'other-operation', name: '另一个' };
    hooks.paused = [checkpoint, other];
    useHarness().removePaused(checkpoint.operationId);
    expect(useHarness().paused).toEqual([other]);
    expect(useHarness().removed).toEqual([checkpoint]);
    expect(patchSalesScript).not.toHaveBeenCalled();
    useHarness().undoRemovePaused(checkpoint.operationId);
    expect(useHarness().paused).toEqual([other, checkpoint]);
    expect(useHarness().removed).toEqual([]);
  });
  it('does not restore a paused job deleted while its script lookup is pending', async () => {
    hooks.paused = [checkpoint];
    let resolveList!: (items: StoredSalesScript[]) => void;
    vi.mocked(listSalesScripts).mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const pending = useHarness().restore(checkpoint);
    useHarness().removePaused(checkpoint.operationId);
    resolveList([item]); await pending;
    expect(useHarness().job).toBeNull();
    expect(useHarness().removed).toEqual([checkpoint]);
    expect(saveScriptBundleJob).not.toHaveBeenCalled();
  });
  it('allows scripts over 30 seconds to complete without submitting unsupported depth', async () => {
    useHarness().start(item.videoUrl, '长视频', 'model', file, undefined, 60); await settle();
    expect(submitDepthVideo).not.toHaveBeenCalled();
    expect(onAnalysis).toHaveBeenCalledTimes(1);
    expect(useHarness().job).toMatchObject({ scriptId: item.id, depthState: 'failed' });
    expect(useHarness().error).toContain('30 秒');
  });

  it('does not let a delayed restore overwrite a newer import', async () => {
    let resolveList!: (items: StoredSalesScript[]) => void;
    vi.mocked(listSalesScripts).mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    vi.mocked(pollDepthVideoTask).mockReturnValue(new Promise(() => undefined));
    const restore = useHarness().restore(checkpoint);
    useHarness().start('/storage/new.mp4', '新视频', 'model', file, { ...item, id: 'script-new', videoUrl: '/storage/new.mp4' });
    resolveList([item]); await restore; await settle();
    expect(useHarness().job?.scriptId).toBe('script-new');
    expect(useHarness().job?.videoUrl).toBe('/storage/new.mp4');
  });
  it('does not let delayed deferral clear a newly started import', async () => {
    vi.mocked(readScriptBundleJob).mockReturnValue(checkpoint);
    let resolvePatch!: (value: StoredSalesScript) => void;
    vi.mocked(patchSalesScript).mockReturnValueOnce(new Promise((resolve) => { resolvePatch = resolve; }));
    vi.mocked(pollDepthVideoTask).mockReturnValue(new Promise(() => undefined));
    useHarness(); await settle();
    const defer = useHarness().deferDepth();
    useHarness().pause();
    useHarness().start('/storage/new.mp4', '新视频', 'model', file, { ...item, id: 'script-new', videoUrl: '/storage/new.mp4' });
    resolvePatch(item); await defer; await settle();
    expect(useHarness().job?.scriptId).toBe('script-new');
  });

});
