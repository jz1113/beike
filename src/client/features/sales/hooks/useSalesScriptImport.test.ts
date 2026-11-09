import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { deleteSalesScript, type StoredSalesScript } from '../api/salesScripts';
import { addSalesScriptImportFiles, readSalesScriptImport, saveSalesScriptImport, type SalesScriptImportItem } from '../model/salesScriptImport';
import { runSalesScriptImportBatch } from '../api/salesScriptImport';
import { useSalesScriptImport } from './useSalesScriptImport';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as (() => unknown)[], cleanup: undefined as (() => void) | undefined }));
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
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../model/salesScriptImport', () => ({ addSalesScriptImportFiles: vi.fn(), readSalesScriptImport: vi.fn(), saveSalesScriptImport: vi.fn() }));
vi.mock('../api/salesScriptImport', () => ({ runSalesScriptImportBatch: vi.fn() }));
vi.mock('../api/salesScripts', () => ({ deleteSalesScript: vi.fn() }));

const source: SalesScriptImportItem = { key: 'video-1', name: '跳舞.mp4', size: 8, lastModified: 1, status: 'queued', error: '', saveId: 'stable-script-1' };
const script = normalizeScriptTemplate({ title: '转身', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, action: '转身' }] }] })!;
const result = { script, model: 'vision', promptVersion: 'v1', videoHash: 'hash' };
const saved: StoredSalesScript = { id: 'script-1', title: script.title, videoUrl: '/source.mp4', videoHash: 'hash', status: 'draft', script,
  model: 'vision', promptVersion: 'v1', version: 1, useCount: 0, updatedAt: '' };
const onSaved = vi.fn();
function useHarness(callback = onSaved) {
  hooks.index = 0;
  const value = useSalesScriptImport(callback);
  hooks.effects.splice(0).forEach((effect) => { hooks.cleanup = effect() as (() => void) | undefined; });
  return value;
}
function deferred() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => { finish = resolve; });
  return { promise, finish };
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = []; hooks.cleanup = undefined;
  vi.resetAllMocks();
  vi.mocked(readSalesScriptImport).mockReturnValue([source]);
  vi.mocked(runSalesScriptImportBatch).mockResolvedValue();
  vi.mocked(addSalesScriptImportFiles).mockImplementation((items) => ({ items: [...items], errors: [] }));
});

describe('action reference batch import lifecycle', () => {
  it('locks the batch synchronously and sends saved rows to the latest library callback', async () => {
    const waiting = deferred();
    vi.mocked(runSalesScriptImportBatch).mockReturnValue(waiting.promise);
    const running = useHarness().start('vision');
    await useHarness().start('vision');
    expect(runSalesScriptImportBatch).toHaveBeenCalledTimes(1);
    expect(useHarness().pending).toBe(true);
    const latest = vi.fn(); useHarness(latest);
    vi.mocked(runSalesScriptImportBatch).mock.calls[0][4](saved);
    expect(latest).toHaveBeenCalledExactlyOnceWith(saved);
    expect(onSaved).not.toHaveBeenCalled();
    waiting.finish(); await running;
    expect(useHarness().pending).toBe(false);
  });

  it('holds the operation lock after pausing until the outstanding request settles', async () => {
    const waiting = deferred();
    vi.mocked(runSalesScriptImportBatch).mockReturnValue(waiting.promise);
    const running = useHarness().start('vision');
    const [, , signal, patch] = vi.mocked(runSalesScriptImportBatch).mock.calls[0];
    patch(source.key, { status: 'analyzing', video: { success: true, videoUrl: '/source.mp4', videoHash: 'hash', durationSec: 3,
      aspectRatio: '9:16', hasAudio: false, sizeBytes: 8 } });
    useHarness().stop();
    expect(signal.aborted).toBe(true);
    await useHarness().start('another-model');
    useHarness().remove(source.key); useHarness().clearCompleted(); useHarness().addFiles([new File(['new'], 'new.mp4')]);
    expect(addSalesScriptImportFiles).not.toHaveBeenCalled();
    expect(runSalesScriptImportBatch).toHaveBeenCalledTimes(1);
    expect(useHarness().pending).toBe(true);
    waiting.finish(); await running;
    expect(useHarness().pending).toBe(false);
    expect(useHarness().items[0]).toMatchObject({ status: 'queued', video: { videoUrl: '/source.mp4' }, saveId: source.saveId });
    await useHarness().start('another-model');
    expect(runSalesScriptImportBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runSalesScriptImportBatch).mock.calls[1][0][0]).toMatchObject({ video: { videoUrl: '/source.mp4' }, saveId: source.saveId });
  });

  it('requires a successful checkpoint before starting any work', async () => {
    vi.mocked(saveSalesScriptImport).mockImplementationOnce(() => { throw new Error('quota'); });
    await useHarness().start('vision');
    expect(runSalesScriptImportBatch).not.toHaveBeenCalled();
    expect(useHarness().pending).toBe(false);
    expect(useHarness().error).toContain('批量进度未能保存');
    await useHarness().start('vision');
    expect(runSalesScriptImportBatch).toHaveBeenCalledTimes(1);
  });

  it('retains an analysis result in memory when checkpoint storage fills and reuses it on resume', async () => {
    vi.mocked(saveSalesScriptImport).mockImplementation((items) => { if (items.some((item) => item.result)) throw new Error('quota'); });
    vi.mocked(runSalesScriptImportBatch).mockImplementationOnce(async (_items, _options, _signal, patch) => {
      patch(source.key, { status: 'saving', result });
    });
    await useHarness().start('vision');
    expect(useHarness().items[0]).toMatchObject({ result, saveId: source.saveId });
    expect(useHarness().error).toContain('批量进度未能保存');
    expect(useHarness().pending).toBe(false);
    vi.mocked(saveSalesScriptImport).mockImplementation(() => undefined);
    await useHarness().start('vision');
    expect(vi.mocked(runSalesScriptImportBatch).mock.calls[1][0][0]).toMatchObject({ result, saveId: source.saveId });
  });

  it('aborts on unmount and rejects late checkpoint writes without replacing the saved queue', async () => {
    const waiting = deferred();
    vi.mocked(runSalesScriptImportBatch).mockReturnValue(waiting.promise);
    const running = useHarness().start('vision');
    const [, , signal, patch, notifySaved] = vi.mocked(runSalesScriptImportBatch).mock.calls[0];
    patch(source.key, { status: 'analyzing' });
    const count = vi.mocked(saveSalesScriptImport).mock.calls.length;
    hooks.cleanup?.();
    expect(signal.aborted).toBe(true);
    expect(() => patch(source.key, { result })).toThrow('队列已暂停');
    notifySaved(saved);
    expect(onSaved).not.toHaveBeenCalled();
    waiting.finish(); await running;
    expect(saveSalesScriptImport).toHaveBeenCalledTimes(count);
    expect(vi.mocked(saveSalesScriptImport).mock.calls.at(-1)?.[0][0]).toMatchObject({ status: 'analyzing' });
  });

  it('keeps completed items untouched and removes only local queue records', async () => {
    const complete = { ...source, key: 'done', scriptId: 'saved', status: 'done' as const };
    vi.mocked(readSalesScriptImport).mockReturnValue([complete, source]);
    vi.mocked(runSalesScriptImportBatch).mockImplementationOnce(async (_items, _options, _signal, patch) => {
      patch(source.key, { status: 'error', error: '网络中断' });
    });
    await useHarness().start('vision');
    expect(useHarness().items).toEqual([complete, { ...source, status: 'error', error: '网络中断' }]);
    useHarness().clearCompleted();
    expect(useHarness().items).toHaveLength(1);
    useHarness().remove(source.key);
    expect(useHarness().items).toEqual([]);
    expect(saveSalesScriptImport).toHaveBeenLastCalledWith([]);
    expect(deleteSalesScript).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
