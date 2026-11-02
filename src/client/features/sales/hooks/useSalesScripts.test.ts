import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { listSalesScripts, normalizePastedScript, patchSalesScript, deleteSalesScript, type StoredSalesScript } from '../api/salesScripts';
import { useSalesScripts } from './useSalesScripts';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void)) => { if (!hooks.cleanup) hooks.cleanup = fn(); },
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
}));
vi.mock('../api/salesScripts', () => ({
  analyzeReferenceVideo: vi.fn(), deleteSalesScript: vi.fn(), fetchScriptAnalysisPrompt: vi.fn(), listSalesScripts: vi.fn(),
  normalizePastedScript: vi.fn(), patchSalesScript: vi.fn(), saveSalesScript: vi.fn(), uploadScriptVideo: vi.fn(),
}));
const script = normalizeScriptTemplate({ title: '转身', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '转身展示{{商品}}' }] }] })!;
const item: StoredSalesScript = { id: 'script-a', title: script.title, videoUrl: '', videoHash: '', status: 'draft', script, model: 'model', promptVersion: 'v1', version: 1, useCount: 0, updatedAt: '' };
function Render() { hooks.index = 0; return useSalesScripts(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.cleanup = undefined;
  vi.resetAllMocks(); vi.mocked(listSalesScripts).mockResolvedValue([item]);
});
afterEach(() => hooks.cleanup?.());

describe('script request lifecycle', () => {
  it('keeps list failures separate from operation errors and clears them on retry', async () => {
    await Render().refresh();
    vi.mocked(deleteSalesScript).mockRejectedValueOnce(new Error('删除失败'));
    expect(await Render().remove(item.id)).toBe(false);
    expect(Render().error).toBe('删除失败');
    expect(Render().listError).toBe('');
    vi.mocked(listSalesScripts).mockRejectedValueOnce(new Error('读取失败'));
    await Render().refresh();
    expect(Render().listError).toBe('读取失败');
    expect(Render().items).toEqual([item]);
    await Render().refresh();
    expect(Render().listError).toBe('');
  });
  it('ignores canceled late analysis and does not clear a newer request', async () => {
    let done!: (value: { script: typeof script; model: string; promptVersion: string; videoHash: string }) => void;
    vi.mocked(normalizePastedScript).mockReturnValueOnce(new Promise((resolve) => { done = resolve; }));
    const oldRun = Render().normalize('old');
    Render().cancel();
    expect(Render().busy).toBe('');
    Render().openStored(item);
    done({ script: { ...script, title: '旧请求' }, model: 'model', promptVersion: 'v1', videoHash: '' }); await oldRun;
    expect(Render().draft?.script.title).toBe(item.title);
  });
  it('blocks duplicate saves and never applies an old save to another draft', async () => {
    Render().openStored(item);
    let done!: (value: StoredSalesScript) => void;
    vi.mocked(patchSalesScript).mockReturnValue(new Promise((resolve) => { done = resolve; }));
    const save = Render().saveDraft('verified');
    expect(await Render().saveDraft('verified')).toBeNull();
    expect(patchSalesScript).toHaveBeenCalledTimes(1);
    Render().closeDraft();
    Render().openStored({ ...item, id: 'script-b' });
    done({ ...item, status: 'verified' });
    expect(await save).toBeNull();
    expect(Render().draft).toMatchObject({ id: 'script-b', status: 'draft' });
    expect(Render().items.find((row) => row.id === item.id)?.status).toBe('verified');
  });
  it('preserves edits made during saving and requires confirmation again', async () => {
    Render().openStored(item);
    let done!: (value: StoredSalesScript) => void;
    vi.mocked(patchSalesScript).mockReturnValue(new Promise((resolve) => { done = resolve; }));
    const save = Render().saveDraft('verified');
    Render().updateDraft({ ...script, title: '新编辑' });
    Render();
    done({ ...item, status: 'verified' });
    expect(await save).toBeNull();
    expect(Render().draft).toMatchObject({ status: 'draft', script: { title: '新编辑' } });
    expect(Render().error).toContain('保存期间');
    expect(Render().hasUnsaved).toBe(true);
  });
  it('does not resurrect deleted items from a stale list response', async () => {
    Render(); await Promise.resolve();
    let done!: (value: StoredSalesScript[]) => void;
    vi.mocked(listSalesScripts).mockReturnValue(new Promise((resolve) => { done = resolve; }));
    const refresh = Render().refresh();
    vi.mocked(deleteSalesScript).mockResolvedValue(undefined);
    await Render().remove(item.id);
    done([item]); await refresh;
    expect(Render().items).toEqual([]);
    expect(Render().loading).toBe(false);
  });
  it('tracks unsaved edits, undo, failed saves, and successfully saved drafts', async () => {
    Render().openStored(item);
    expect(Render().hasUnsaved).toBe(false);
    Render().updateDraft({ ...script, title: '新标题' });
    expect(Render().hasUnsaved).toBe(true);
    Render().updateDraft({ ...script });
    expect(Render().hasUnsaved).toBe(false);
    const edited = { ...script, title: '待保存的标题' };
    Render().updateDraft(edited);
    vi.mocked(patchSalesScript).mockRejectedValueOnce(new Error('保存失败'));
    await Render().saveDraft('draft');
    expect(Render().hasUnsaved).toBe(true);
    vi.mocked(patchSalesScript).mockResolvedValueOnce({ ...item, script: edited });
    await Render().saveDraft('draft');
    expect(Render().hasUnsaved).toBe(false);
    Render().closeDraft();
    expect(Render().hasUnsaved).toBe(false);
  });
  it('marks a newly imported script as unsaved even before editing it', async () => {
    vi.mocked(normalizePastedScript).mockResolvedValueOnce({ script, model: 'model', promptVersion: 'v1', videoHash: '' });
    await Render().normalize('分镜内容');
    expect(Render().hasUnsaved).toBe(true);
  });
  it('keeps an edited script open when a background import finishes', async () => {
    Render().openStored(item);
    Render().updateDraft({ ...script, title: '当前未保存编辑' });
    Render().acceptAnalysis({ script: { ...script, title: '后台结果' }, existingId: 'script-other', model: 'model', promptVersion: 'v1', videoHash: '' }, '/storage/other.mp4');
    expect(Render().draft?.script.title).toBe('当前未保存编辑');
    expect(Render().hasUnsaved).toBe(true);
  });

});
