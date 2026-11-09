import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SalesPrompt } from '@shared/contracts/salesAssetViews';
import { listSalesPrompts, SalesPromptRequestError, saveSalesPrompt } from '../api/salesMaterials';
import { useSalesPrompts } from './useSalesPrompts';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', () => ({
  useCallback: (fn: unknown, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { fn: unknown; deps: unknown[] } | undefined;
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) hooks.slots[index] = { fn, deps };
    return (hooks.slots[index] as { fn: unknown }).fn;
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.slots[index] = deps;
      hooks.effects.push(() => {
        hooks.cleanups.get(index)?.();
        hooks.cleanups.delete(index);
        const cleanup = effect();
        if (cleanup) hooks.cleanups.set(index, cleanup);
      });
    }
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../api/salesMaterials', async (original) => ({ ...await original<typeof import('../api/salesMaterials')>(), listSalesPrompts: vi.fn(), saveSalesPrompt: vi.fn() }));
const summary: SalesPrompt = { id: 'summary', title: '卖点提炼', description: '', prompt: '自定义旧稿', defaultPrompt: '默认稿', version: 'v1', customized: true, configured: true };
const script: SalesPrompt = { ...summary, id: 'script-analysis', title: '脚本拆解', prompt: '拆解要求' };
const grid: SalesPrompt = { ...summary, id: 'persona-grid', title: '人物补图 · 九宫格', prompt: '人物 3×3 等分九宫格', version: 'grid-v1' };
function Render(enabled = true) {
  hooks.index = 0;
  const manager = useSalesPrompts(enabled);
  hooks.effects.splice(0).forEach((effect) => effect());
  return manager;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}
async function settle() { await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = []; hooks.cleanups.clear();
  vi.resetAllMocks();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.mocked(listSalesPrompts).mockResolvedValue([summary, script]);
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

it('includes asset creation templates and excludes retired single-view prompts from older servers', async () => {
  const currentIds = ['summary', 'script-analysis', 'plan-adapt', 'spoken-copy', 'spoken-review', 'final-video', 'final-video-depth', 'persona-design', 'scene-design', 'persona-grid', 'scene-grid'];
  const retiredIds = ['script-normalize', 'persona-face', 'persona-front', 'persona-side', 'scene-left', 'scene-right', 'scene-reverse'];
  vi.mocked(listSalesPrompts).mockResolvedValue([...currentIds, ...retiredIds].map((id) => ({ ...summary, id })));
  await Render().refresh();
  expect(Render().items.map(({ id }) => id)).toEqual(currentIds);
});

it('saves the grid template independently while preserving another stage draft', async () => {
  vi.mocked(listSalesPrompts).mockResolvedValue([summary, grid]);
  await Render().refresh();
  Render().updateDraft('未保存的文案要求');
  Render().select(grid.id);
  expect(Render().text).toBe(grid.prompt);
  Render().updateDraft('人物 3×3 等分九宫格，统一浅灰背景');
  const saved = { ...grid, prompt: '人物 3×3 等分九宫格，统一浅灰背景', version: 'grid-v2' };
  vi.mocked(saveSalesPrompt).mockResolvedValue(saved);
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenCalledExactlyOnceWith(grid.id, saved.prompt, grid.version);
  expect(Render().selected).toEqual(saved);
  Render().select(summary.id);
  expect(Render().text).toBe('未保存的文案要求');
  expect(Render().hasUnsaved).toBe(true);
});

it('requires an explicit save before the visible initial final-video template can execute', async () => {
  const initial = { ...summary, id: 'final-video', title: '最终视频生成', prompt: '', defaultPrompt: '可编辑的初始模板', configured: false, customized: false };
  vi.mocked(listSalesPrompts).mockResolvedValue([initial]);
  await Render().refresh();
  expect(Render()).toMatchObject({ text: initial.defaultPrompt, hasUnsaved: false });
  expect(Render().dirty(initial)).toBe(true);
  const saved = { ...initial, prompt: initial.defaultPrompt, configured: true, customized: true, version: 'saved-v1' };
  vi.mocked(saveSalesPrompt).mockResolvedValue(saved);
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenCalledExactlyOnceWith('final-video', initial.defaultPrompt, initial.version);
  expect(Render().selected).toEqual(saved);
  expect(Render().dirty(saved)).toBe(false);
});

it('saves the depth template independently and preserves the script template draft', async () => {
  const scriptFinal = { ...summary, id: 'final-video', title: '最终视频生成 · 纯分镜版' };
  const depthFinal = { ...summary, id: 'final-video-depth', title: '最终视频生成 · 深度视频版' };
  vi.mocked(listSalesPrompts).mockResolvedValue([scriptFinal, depthFinal]);
  await Render().refresh();
  Render().updateDraft('纯分镜的独立编辑');
  Render().select(depthFinal.id);
  Render().updateDraft('深度视频只参考动作');
  const saved = { ...depthFinal, prompt: '深度视频只参考动作', version: 'depth-v2' };
  vi.mocked(saveSalesPrompt).mockResolvedValue(saved);
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenCalledExactlyOnceWith(depthFinal.id, saved.prompt, depthFinal.version);
  Render().select(scriptFinal.id);
  expect(Render().text).toBe('纯分镜的独立编辑');
  expect(Render().selected?.prompt).toBe(scriptFinal.prompt);
});

it('retains independent drafts when changing stages and leaving the manager tab', async () => {
  await Render().refresh();
  Render().updateDraft('新的卖点要求');
  Render().select(script.id);
  Render().updateDraft('新的拆解要求');
  expect(Render(false).text).toBe('新的拆解要求');
  Render().select(summary.id);
  expect(Render().text).toBe('新的卖点要求');
  expect(Render().hasUnsaved).toBe(true);
});

it('saves edits as the current system prompt and reads them back after refresh', async () => {
  await Render().refresh();
  Render().updateDraft('新的系统提示词');
  expect(Render().selected?.prompt).toBe(summary.prompt);
  expect(Render().hasUnsaved).toBe(true);
  expect(saveSalesPrompt).not.toHaveBeenCalled();
  const saved = { ...summary, prompt: '新的系统提示词', version: 'v2' };
  vi.mocked(saveSalesPrompt).mockResolvedValue(saved);
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenCalledWith(summary.id, saved.prompt, 'v1');
  expect(Render().selected?.prompt).toBe(saved.prompt);
  expect(Render().text).toBe(saved.prompt);
  expect(Render().hasUnsaved).toBe(false);
  vi.mocked(listSalesPrompts).mockResolvedValue([saved, script]);
  await Render().refresh();
  expect(Render().text).toBe(saved.prompt);
  expect(Render().hasUnsaved).toBe(false);
});

it('retains draft after conflict and refreshes the saved version for an explicit retry', async () => {
  await Render().refresh();
  Render().updateDraft('我的编辑');
  vi.mocked(saveSalesPrompt).mockRejectedValueOnce(new SalesPromptRequestError('其他窗口已更新', 409));
  await Render().save();
  expect(Render().conflict).toBe(true);
  expect(Render().text).toBe('我的编辑');
  vi.mocked(listSalesPrompts).mockResolvedValue([{ ...summary, prompt: '其他窗口的编辑', version: 'v2' }, script]);
  await Render().refresh();
  expect(Render().selected?.prompt).toBe('其他窗口的编辑');
  expect(Render().text).toBe('我的编辑');
  vi.mocked(saveSalesPrompt).mockResolvedValue({ ...summary, prompt: '我的编辑', version: 'v3' });
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenLastCalledWith(summary.id, '我的编辑', 'v2');
  expect(Render().hasUnsaved).toBe(false);
});

it('does not save blank text or discard a draft after a server failure', async () => {
  await Render().refresh();
  Render().updateDraft('  ');
  await Render().save();
  expect(saveSalesPrompt).not.toHaveBeenCalled();
  Render().updateDraft('稍后重试的编辑');
  vi.mocked(saveSalesPrompt).mockRejectedValueOnce(new Error('数据库不可写'));
  await Render().save();
  expect(Render().text).toBe('稍后重试的编辑');
  expect(Render().error).toBe('数据库不可写');
});

it('does not retain a stale draft after the user undoes their text edits', async () => {
  await Render().refresh();
  Render().updateDraft('临时编辑');
  Render().updateDraft(summary.prompt);
  expect(Render().hasUnsaved).toBe(false);
  vi.mocked(listSalesPrompts).mockResolvedValue([{ ...summary, prompt: '已更新的服务端版本', version: 'v2' }, script]);
  await Render().refresh();
  expect(Render().text).toBe('已更新的服务端版本');
  expect(Render().hasUnsaved).toBe(false);
});

it('reloads on each entry and preserves edits while using the newly read version on save', async () => {
  Render(false);
  expect(listSalesPrompts).not.toHaveBeenCalled();
  Render(); await settle();
  expect(Render().verified).toBe(true);
  Render().updateDraft('保留我的未保存修改');
  Render(false);
  const remote = { ...summary, prompt: '后台刚更新', version: 'v2' };
  vi.mocked(listSalesPrompts).mockResolvedValue([remote, script]);
  Render(); await settle();
  expect(listSalesPrompts).toHaveBeenCalledTimes(2);
  expect(Render().selected).toEqual(remote);
  expect(Render().text).toBe('保留我的未保存修改');
  vi.mocked(saveSalesPrompt).mockResolvedValue({ ...remote, prompt: '保留我的未保存修改', version: 'v3' });
  await Render().save();
  expect(saveSalesPrompt).toHaveBeenCalledExactlyOnceWith(summary.id, '保留我的未保存修改', 'v2');
});

it('ignores a late response from a previous visit and keeps the new read authoritative', async () => {
  const old = deferred<SalesPrompt[]>();
  const current = deferred<SalesPrompt[]>();
  vi.mocked(listSalesPrompts).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  Render();
  const oldSignal = vi.mocked(listSalesPrompts).mock.calls[0][0];
  Render(false); Render();
  expect(oldSignal?.aborted).toBe(true);
  current.resolve([{ ...summary, prompt: '新版本', version: 'v2' }]); await settle();
  expect(Render()).toMatchObject({ text: '新版本', verified: true, loading: false });
  old.resolve([summary]); await settle();
  expect(Render()).toMatchObject({ text: '新版本', verified: true, loading: false });
});

it('removes a draft acknowledged by the server so a later update cannot resurrect old text', async () => {
  Render(); await settle();
  Render().updateDraft('实际已保存');
  vi.mocked(listSalesPrompts).mockResolvedValue([{ ...summary, prompt: '实际已保存', version: 'v2' }]);
  await Render().refresh();
  expect(Render().hasUnsaved).toBe(false);
  vi.mocked(listSalesPrompts).mockResolvedValue([{ ...summary, prompt: '最新后台规则', version: 'v3' }]);
  await Render().refresh();
  expect(Render()).toMatchObject({ text: '最新后台规则', hasUnsaved: false });
});

it('does not call cached contents effective or save them after a failed refresh', async () => {
  Render(); await settle();
  Render().updateDraft('保留草稿');
  vi.mocked(listSalesPrompts).mockRejectedValueOnce(new Error('暂时无法连接后台'));
  await Render().refresh();
  expect(Render()).toMatchObject({ verified: false, text: '保留草稿', error: '暂时无法连接后台' });
  expect(Render().selected?.prompt).toBe(summary.prompt);
  await Render().save();
  expect(saveSalesPrompt).not.toHaveBeenCalled();
  await Render().refresh();
  expect(Render().verified).toBe(true);
});

it('blocks stale save handlers while a refresh is already in flight', async () => {
  Render(); await settle();
  Render().updateDraft('正在编辑');
  const stale = Render();
  const pending = deferred<SalesPrompt[]>();
  vi.mocked(listSalesPrompts).mockReturnValueOnce(pending.promise);
  const refresh = stale.refresh();
  await stale.save();
  expect(saveSalesPrompt).not.toHaveBeenCalled();
  pending.resolve([{ ...summary, version: 'v2' }]); await refresh;
  expect(Render()).toMatchObject({ text: '正在编辑', verified: true });
});

it('keeps a pending save isolated and refreshes a reentered page once that save settles', async () => {
  Render(); await settle();
  Render().updateDraft('提交中的内容');
  const pending = deferred<SalesPrompt>();
  vi.mocked(saveSalesPrompt).mockReturnValueOnce(pending.promise);
  const stale = Render();
  const save = stale.save();
  stale.updateDraft('迟到的输入');
  expect(Render().text).toBe('提交中的内容');
  Render(false); Render();
  expect(listSalesPrompts).toHaveBeenCalledTimes(1);
  const saved = { ...summary, prompt: '提交中的内容', version: 'v2' };
  vi.mocked(listSalesPrompts).mockResolvedValue([saved, script]);
  pending.resolve(saved); await save; await settle();
  expect(listSalesPrompts).toHaveBeenCalledTimes(2);
  expect(Render()).toMatchObject({ text: saved.prompt, verified: true, saving: false, loading: false, hasUnsaved: false });
});
