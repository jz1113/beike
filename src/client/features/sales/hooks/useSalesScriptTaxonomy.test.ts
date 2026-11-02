import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import { createScriptTaxonomy, deleteScriptTaxonomy, listScriptTaxonomy, renameScriptTaxonomy } from '../api/salesScriptTaxonomy';
import { useSalesScriptTaxonomy } from './useSalesScriptTaxonomy';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
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
vi.mock('../api/salesScriptTaxonomy', () => ({
  createScriptTaxonomy: vi.fn(), deleteScriptTaxonomy: vi.fn(), listScriptTaxonomy: vi.fn(), renameScriptTaxonomy: vi.fn(),
}));

const category: ScriptTaxonomyItem = { id: 'category-1', kind: 'category', name: '服装' };
function Render() { hooks.index = 0; return useSalesScriptTaxonomy(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = [];
  vi.resetAllMocks();
  vi.mocked(listScriptTaxonomy).mockResolvedValue([category]);
});

describe('script taxonomy request lifecycle', () => {
  it('keeps the newest refresh result when older responses arrive late', async () => {
    const old = deferred<ScriptTaxonomyItem[]>();
    vi.mocked(listScriptTaxonomy).mockReturnValueOnce(old.promise);
    const oldRefresh = Render().refresh();
    const oldSignal = vi.mocked(listScriptTaxonomy).mock.calls[0][0];
    await Render().refresh();
    expect(oldSignal?.aborted).toBe(true);
    old.resolve([]); await oldRefresh;
    expect(Render().items).toEqual([category]);
    expect(Render().loading).toBe(false);
  });

  it('honors caller cancellation without changing the current list', async () => {
    await Render().refresh();
    const pending = deferred<ScriptTaxonomyItem[]>();
    vi.mocked(listScriptTaxonomy).mockReturnValueOnce(pending.promise);
    const caller = new AbortController();
    const refresh = Render().refresh(caller.signal);
    const signal = vi.mocked(listScriptTaxonomy).mock.calls[1][0];
    caller.abort();
    expect(signal?.aborted).toBe(true);
    pending.resolve([]); await refresh;
    expect(Render().items).toEqual([category]);
    expect(Render().loading).toBe(false);
  });

  it.each(['create', 'rename', 'remove'] as const)('does not undo a completed %s with a stale refresh', async (operation) => {
    await Render().refresh();
    const old = deferred<ScriptTaxonomyItem[]>();
    vi.mocked(listScriptTaxonomy).mockReturnValueOnce(old.promise);
    const refresh = Render().refresh();
    const created = { ...category, id: 'category-2', name: '食品' };
    const renamed = { ...category, name: '上装' };
    vi.mocked(createScriptTaxonomy).mockResolvedValue(created);
    vi.mocked(renameScriptTaxonomy).mockResolvedValue(renamed);
    vi.mocked(deleteScriptTaxonomy).mockResolvedValue(undefined);
    if (operation === 'create') await Render().create('category', created.name);
    else if (operation === 'rename') await Render().rename(category.id, renamed.name);
    else await Render().remove(category.id);
    old.resolve([category]); await refresh;
    expect(Render().items).toEqual(operation === 'create' ? [category, created] : operation === 'rename' ? [renamed] : []);
    expect(Render().loading).toBe(false);
  });

  it('does not start a refresh during a write and keeps the library after a failed write', async () => {
    await Render().refresh();
    const pending = deferred<ScriptTaxonomyItem>();
    vi.mocked(renameScriptTaxonomy).mockReturnValueOnce(pending.promise);
    const rename = Render().rename(category.id, '上装');
    await Render().refresh();
    expect(listScriptTaxonomy).toHaveBeenCalledTimes(1);
    pending.resolve({ ...category, name: '上装' }); await rename;
    vi.mocked(deleteScriptTaxonomy).mockRejectedValueOnce(new Error('删除失败'));
    expect(await Render().remove(category.id)).toBe(false);
    expect(Render().items[0].name).toBe('上装');
    expect(Render().error).toBe('删除失败');
  });
});
