import { describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import type { patchSalesScript, saveSalesScript, StoredSalesScript } from '../api/salesScripts';
import { ScriptDepthFailed } from '../api/salesScriptDepth';
import { runSalesScriptImportBatch } from '../api/salesScriptImport';
import { addSalesScriptImportFiles, MAX_SCRIPT_IMPORT_FILES, type SalesScriptImportItem, type SalesScriptImportVideo } from './salesScriptImport';

const file = (name = '转身.mp4') => new File(['video'], name, { type: 'video/mp4', lastModified: 123 });
const script = normalizeScriptTemplate({ title: '模型分析名称', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, action: '转身' }] }] })!;
const video = (name = '转身.mp4'): SalesScriptImportVideo => ({ success: true, videoUrl: `/storage/${name}`, videoHash: `hash-${name}`,
  durationSec: 3, aspectRatio: '9:16', hasAudio: false, sizeBytes: 5 });
const stored = (patch: Partial<StoredSalesScript> = {}): StoredSalesScript => ({ id: 'script-default', title: script.title, videoUrl: '/storage/转身.mp4',
  videoHash: 'hash', status: 'draft', script, model: 'model', promptVersion: 'v1', version: 1, useCount: 0, updatedAt: '', ...patch });
const analyzed = { script, model: 'model', promptVersion: 'v1', videoHash: 'hash' };

function harness(names = ['转身.mp4']) {
  let items = addSalesScriptImportFiles([], names.map((name) => file(name))).items;
  const onPatch = vi.fn((key: string, patch: Partial<SalesScriptImportItem>) => { items = items.map((item) => item.key === key ? { ...item, ...patch } : item); });
  const services = {
    upload: vi.fn(async (source: File) => video(source.name)),
    analyze: vi.fn(async () => analyzed),
    prompt: vi.fn(async () => ({ success: true as const, prompt: '分析', promptVersion: 'v1' })),
    list: vi.fn(async (): Promise<StoredSalesScript[]> => []),
    read: vi.fn(async (): Promise<StoredSalesScript | null> => null),
    save: vi.fn(async (input: Parameters<typeof saveSalesScript>[0]) => stored({ ...input, id: input.id!, title: input.script.title })),
    patch: vi.fn(async (id: string, patch: Parameters<typeof patchSalesScript>[1]) => stored({ id, ...patch })),
    submitDepth: vi.fn(async () => ({ taskId: 'depth-task' })),
    readDepth: vi.fn(async (): Promise<{ taskId?: string; resultUrl?: string }> => ({ taskId: 'depth-task' })),
    waitDepth: vi.fn(async () => '/storage/depth.mp4'),
  };
  const onSaved = vi.fn();
  const run = (includeDepth = false, signal = new AbortController().signal, model = 'chosen-model') => runSalesScriptImportBatch(items,
    { model, includeDepth }, signal, onPatch, onSaved, services);
  return { get items() { return items; }, set items(next: SalesScriptImportItem[]) { items = next; }, onPatch, services, onSaved, run };
}

describe('action reference batch import selection', () => {
  it('deduplicates consecutive selections and restores missing files without changing receipts', () => {
    const first = addSalesScriptImportFiles([], [file(), file('侧身.MOV')]);
    const lost = { ...first.items[0], file: undefined, scriptId: 'saved', status: 'error' as const };
    const next = addSalesScriptImportFiles([lost, first.items[1]], [file(), file('侧身.MOV')]);
    expect(next.items).toHaveLength(2);
    expect(next.items[0]).toMatchObject({ key: lost.key, saveId: lost.saveId, scriptId: 'saved', file: expect.any(File) });
  });

  it('rejects unsupported, empty and oversized files and caps the full queue across selections', () => {
    const big = file('huge.mp4'); Object.defineProperty(big, 'size', { value: 64 * 1024 * 1024 + 1 });
    expect(addSalesScriptImportFiles([], [file('bad.avi'), big, new File([], 'empty.mp4')]).errors).toHaveLength(3);
    const first = addSalesScriptImportFiles([], Array.from({ length: MAX_SCRIPT_IMPORT_FILES }, (_, i) => file(`${i}.mp4`)));
    expect(addSalesScriptImportFiles(first.items, [file(), file('another.mp4')])).toMatchObject({ items: expect.any(Array), errors: [expect.stringContaining('30')] });
    expect(addSalesScriptImportFiles(first.items, [file()]).items).toHaveLength(30);
  });

  it('restores a reselected file in a full queue even after new files are rejected', () => {
    const full = addSalesScriptImportFiles([], Array.from({ length: MAX_SCRIPT_IMPORT_FILES }, (_, i) => file(`${i}.mp4`))).items;
    full[0] = { ...full[0], file: undefined, scriptId: 'saved-script' };
    const result = addSalesScriptImportFiles(full, [file('new.mp4'), file('another-new.mp4'), file('0.mp4')]);
    expect(result.items).toHaveLength(MAX_SCRIPT_IMPORT_FILES);
    expect(result.errors).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ file: expect.any(File), scriptId: 'saved-script', key: full[0].key });
  });
});

describe('action reference batch execution', () => {
  it('isolates failures and retries a pending save with its stable ID without reuploading or analyzing', async () => {
    const h = harness(['a.mp4', 'b.mp4']);
    h.services.save.mockRejectedValueOnce(new Error('数据库暂不可用'));
    await h.run();
    expect(h.items.map((item) => item.status)).toEqual(['error', 'done']);
    const id = h.items[0].saveId;
    expect(h.items[0]).toMatchObject({ video: video('a.mp4'), result: analyzed, error: '数据库暂不可用' });
    await h.run();
    expect(h.services.upload).toHaveBeenCalledTimes(2);
    expect(h.services.analyze).toHaveBeenCalledTimes(2);
    expect(h.services.save).toHaveBeenCalledTimes(3);
    expect(h.services.save).toHaveBeenLastCalledWith(expect.objectContaining({ id, status: 'verified', script }));
    expect(h.items.map((item) => item.status)).toEqual(['done', 'done']);
    expect(h.items.every((item) => item.scriptId && !item.result)).toBe(true);
  });

  it('reconciles a lost save receipt by exact ID and preserves later user edits and confirmation', async () => {
    const h = harness();
    h.services.save.mockRejectedValueOnce(new Error('回执丢失'));
    await h.run();
    const manual = stored({ id: h.items[0].saveId, title: '用户新名称', status: 'verified',
      script: { ...script, title: '用户新名称', taxonomy: { ...script.taxonomy, categoryId: 'manual-category' } } });
    h.services.read.mockResolvedValue(manual);
    await h.run();
    expect(h.services.save).toHaveBeenCalledTimes(1);
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
    expect(h.onSaved).toHaveBeenLastCalledWith(manual);
    expect(h.items[0]).toMatchObject({ scriptId: manual.id, status: 'done' });
  });

  it('reconciles only validated analysis under the current prompt before repeating a model call', async () => {
    const h = harness();
    const cached = stored({ analysisCacheEligible: true });
    h.services.list.mockResolvedValue([{ ...cached, id: 'old', promptVersion: 'v0' }, { ...cached, id: 'bad', analysisCacheEligible: false }, cached]);
    h.services.analyze.mockResolvedValueOnce({...analyzed, ...{existingId: cached.id}});
    h.services.read.mockResolvedValueOnce(cached);
    await h.run();
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
    expect(h.services.save).not.toHaveBeenCalled();
    expect(h.onSaved).toHaveBeenCalledWith(cached);
    expect(h.items[0]).toMatchObject({ scriptId: cached.id, status: 'done' });
  });

  it('does not analyze when the current prompt or reconciliation read is unavailable', async () => {
    const h = harness();
    h.services.analyze.mockRejectedValueOnce(new Error('读取规则失败'));
    await h.run();
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
    expect(h.items[0]).toMatchObject({ status: 'error', error: '读取规则失败' });
    h.services.analyze.mockResolvedValueOnce({ ...analyzed });
    h.services.read.mockRejectedValueOnce(new Error('回执查询失败'));
    await h.run();
    expect(h.services.save).not.toHaveBeenCalled();
    expect(h.items[0]).toMatchObject({ status: 'error', error: '回执查询失败' });
  });

  it('uses a newly selected model when retrying analysis, and reuploads the local file after analysis discarded its input', async () => {
    const h = harness();
    h.services.analyze.mockRejectedValueOnce(new Error('模型不可用'));
    await h.run();
    expect(h.items[0]).toMatchObject({ status: 'error', model: 'chosen-model' });
    await h.run(false, new AbortController().signal, 'replacement-model');
    expect(h.services.analyze).toHaveBeenLastCalledWith(video().videoUrl, 'replacement-model', expect.any(AbortSignal));
    expect(h.services.upload).toHaveBeenCalledTimes(2);
    expect(h.items[0]).toMatchObject({ status: 'done', model: 'replacement-model', video: undefined, file: undefined });
  });

  it('retains an accepted upload and stops remaining items when aborted', async () => {
    const h = harness(['a.mp4', 'b.mp4']); const controller = new AbortController();
    h.services.upload.mockImplementationOnce(async () => { controller.abort(); return video('a.mp4'); });
    await h.run(false, controller.signal);
    expect(h.items[0].video).toEqual(video('a.mp4'));
    expect(h.services.analyze).not.toHaveBeenCalled();
    expect(h.services.upload).toHaveBeenCalledTimes(1);
    expect(h.items[1].status).toBe('queued');
  });

  it('retains a save accepted during cancellation and reconciles fresh edits on resume', async () => {
    const h = harness(['a.mp4', 'b.mp4']); const controller = new AbortController();
    const accepted = stored({ id: 'accepted-script' });
    h.services.save.mockImplementationOnce(async () => { controller.abort(); return accepted; });
    await h.run(false, controller.signal);
    expect(h.items[0].scriptId).toBe(accepted.id);
    expect(h.onSaved).toHaveBeenCalledWith(accepted);
    expect(h.items[1].status).toBe('queued');
    h.services.read.mockResolvedValue(stored({ ...accepted, title: '用户刚刚改名', status: 'verified' }));
    h.items = [h.items[0]]; await h.run();
    expect(h.services.save).toHaveBeenCalledTimes(1);
    expect(h.onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ title: '用户刚刚改名', status: 'verified' }));
  });

  it('stops the whole batch if a receipt checkpoint cannot be saved', async () => {
    const h = harness(['a.mp4', 'b.mp4']);
    h.onPatch.mockImplementation((key, patch) => {
      h.items = h.items.map((item) => item.key === key ? { ...item, ...patch } : item);
      if (patch.video) throw new Error('存储空间已满');
    });
    await expect(h.run()).rejects.toThrow('存储空间已满');
    expect(h.items[0].video).toEqual(video('a.mp4'));
    expect(h.services.upload).toHaveBeenCalledTimes(1);
    expect(h.services.analyze).not.toHaveBeenCalled();
    expect(h.items[1].status).toBe('queued');
  });
});

describe('optional depth in action reference batch import', () => {
  it('exposes the saved draft before conversion, and only patches media fields after user edits', async () => {
    const h = harness();
    const manual = stored({ title: '后改名称', status: 'verified', script: { ...script, taxonomy: { ...script.taxonomy, categoryId: 'new-category' } } });
    h.services.waitDepth.mockImplementationOnce(async () => {
      expect(h.onSaved).toHaveBeenCalled();
      h.services.patch.mockResolvedValue(manual); return '/storage/depth.mp4';
    });
    await h.run(true);
    expect(h.items[0]).toMatchObject({ status: 'done', depthState: 'ready', depthVideoUrl: '/storage/depth.mp4' });
    for (const [, patch] of h.services.patch.mock.calls) {
      expect(patch).not.toHaveProperty('script'); expect(patch).not.toHaveProperty('status'); expect(patch).not.toHaveProperty('title');
    }
    expect(h.onSaved).toHaveBeenLastCalledWith(manual);
  });

  it('recovers ambiguous submissions by operation ID, never resubmitting the depth job', async () => {
    const h = harness();
    h.services.submitDepth.mockRejectedValueOnce(generationRecoveryError('提交回执待核对'));
    await h.run(true);
    const operation = h.items[0].depthOperationId;
    expect(h.items[0]).toMatchObject({ status: 'error', depthState: 'submitted' });
    h.services.read.mockResolvedValue(stored({ id: h.items[0].scriptId! }));
    await h.run(false);
    expect(h.services.submitDepth).toHaveBeenCalledTimes(1);
    expect(h.services.readDepth).toHaveBeenCalledExactlyOnceWith(true, operation, expect.any(AbortSignal));
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
    expect(h.items[0]).toMatchObject({ status: 'done', depthOperationId: operation, depthState: 'ready', includeDepth: true });
  });

  it('can switch off unsubmitted depth when retrying only a failed script save', async () => {
    const h = harness();
    h.services.save.mockRejectedValueOnce(new Error('仅保存失败'));
    await h.run(true);
    expect(h.items[0]).toMatchObject({ status: 'error', includeDepth: true });
    await h.run(false);
    expect(h.items[0]).toMatchObject({ status: 'done', includeDepth: false });
    expect(h.services.submitDepth).not.toHaveBeenCalled();
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
  });

  it('uses a new operation only after confirmed failure and reuses saved script and video', async () => {
    const h = harness();
    h.services.waitDepth.mockRejectedValueOnce(new ScriptDepthFailed('任务确实失败'));
    await h.run(true);
    const failedOperation = h.items[0].depthOperationId;
    expect(h.items[0].depthState).toBe('failed');
    h.services.read.mockResolvedValue(stored({ id: h.items[0].scriptId!, depthTaskId: h.items[0].depthTaskId, depthOperationId: failedOperation }));
    await h.run(true);
    expect(h.services.submitDepth).toHaveBeenCalledTimes(2);
    expect(h.items[0].depthOperationId).not.toBe(failedOperation);
    expect(h.services.analyze).toHaveBeenCalledTimes(1);
    expect(h.services.upload).toHaveBeenCalledTimes(1);
  });

  it.each(['prepared', 'failed'] as const)('adopts accepted server work started in script details after a %s queue row paused', async (depthState) => {
    const h = harness();
    h.items = [{ ...h.items[0], video: video(), scriptId: 'existing-script', depthState,
      depthOperationId: 'queue-operation', depthTaskId: depthState === 'failed' ? 'queue-failed-task' : '' }];
    h.services.read.mockResolvedValue(stored({ id: 'existing-script', depthOperationId: 'detail-operation', depthTaskId: 'detail-task' }));
    await h.run(true);
    expect(h.services.submitDepth).not.toHaveBeenCalled();
    expect(h.services.waitDepth).toHaveBeenCalledExactlyOnceWith('detail-task', expect.any(AbortSignal), expect.any(Function));
    expect(h.services.analyze).not.toHaveBeenCalled();
    expect(h.items[0]).toMatchObject({ status: 'done', depthOperationId: 'detail-operation', depthTaskId: 'detail-task', depthState: 'ready' });
  });

  it('keeps successful scripts when video exceeds depth limits', async () => {
    const h = harness();
    h.services.upload.mockResolvedValueOnce({ ...video(), durationSec: 45 });
    await h.run(true);
    expect(h.items[0]).toMatchObject({ status: 'done', depthState: 'skipped', depthProgress: expect.stringContaining('已保存脚本') });
    expect(h.services.submitDepth).not.toHaveBeenCalled();
    expect(h.onSaved).toHaveBeenCalled();
  });

  it('resumes a saved conversion result without rerunning analysis or depth work', async () => {
    const h = harness(); const current = stored({ depthVideoUrl: '/storage/already-depth.mp4', depthTaskId: 'accepted-task' });
    h.items = [{ ...h.items[0], video: video(), scriptId: current.id }];
    h.services.read.mockResolvedValue(current);
    await h.run(true);
    expect(h.services.analyze).not.toHaveBeenCalled(); expect(h.services.submitDepth).not.toHaveBeenCalled();
    expect(h.services.waitDepth).not.toHaveBeenCalled();
    expect(h.items[0]).toMatchObject({ status: 'done', depthVideoUrl: current.depthVideoUrl });
  });
});
