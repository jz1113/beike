import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSalesProductionTask } from './useSalesProductionTask';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.slots[index] = deps;
      hooks.effects.push(() => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); });
    }
  },
}));

function Render(context = 'product-a:script-1') {
  hooks.index = 0;
  const task = useSalesProductionTask(context);
  hooks.effects.splice(0).forEach((effect) => effect());
  return task;
}
function deferred() {
  let finish!: (value: string) => void;
  const promise = new Promise<string>((resolve) => { finish = resolve; });
  return { promise, finish };
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; hooks.effects = []; hooks.cleanups = []; });
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); });

describe('production task isolation', () => {
  it('submits only once on rapid repeated clicks, keeping the original request alive', async () => {
    const pending = deferred();
    let signal!: AbortSignal;
    const first = Render().runTask('video', '提交中', (current) => { signal = current; return pending.promise; });
    const duplicate = vi.fn(async () => 'duplicate');
    expect(await Render().runTask('video', '重复提交', duplicate)).toBeNull();
    expect(duplicate).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(false);
    expect(Render().busy).toBe('video');
    pending.finish('original');
    expect(await first).toBe('original');
    expect(Render().busy).toBe('');
  });

  it('discards late results after cancellation and cannot overwrite the next task progress', async () => {
    const old = deferred();
    const next = deferred();
    let oldProgress!: (message: string) => void;
    const oldRun = Render().runTask('video', '旧任务', (_signal, progress) => { oldProgress = progress; return old.promise; });
    Render().cancel();
    const nextRun = Render().runTask('video', '新任务', () => next.promise);
    oldProgress('过期进度');
    old.finish('old.mp4');
    expect(await oldRun).toBeNull();
    expect(Render()).toMatchObject({ busy: 'video', progressText: '新任务' });
    next.finish('new.mp4');
    expect(await nextRun).toBe('new.mp4');
  });

  it('aborts on product, script or input changes and prevents output leaking across drafts', async () => {
    const pending = deferred();
    let signal!: AbortSignal;
    const run = Render().runTask('adapt', '改编中', (current) => { signal = current; return pending.promise; });
    Render('product-b:script-2');
    expect(signal.aborted).toBe(true);
    expect(Render('product-b:script-2').error).toContain('方案已更新');
    pending.finish('old-product-copy');
    expect(await run).toBeNull();
  });

  it('ignores old errors after another request starts and reports the current failure', async () => {
    let reject!: (reason: Error) => void;
    const oldRun = Render().runTask('tts', '旧配音', () => new Promise<string>((_resolve, fail) => { reject = fail; }));
    Render().cancel();
    const next = deferred();
    const nextRun = Render().runTask('video', '新视频', () => next.promise);
    reject(new Error('过期错误'));
    await oldRun;
    expect(Render()).toMatchObject({ error: '', busy: 'video' });
    next.finish('video'); await nextRun;
    await Render().runTask('mix', '合成', async () => { throw new Error('音轨读取失败'); });
    expect(Render()).toMatchObject({ error: '音轨读取失败', busy: '' });
  });

  it('discards late output after leaving the workspace even when the service ignores abort', async () => {
    const pending = deferred();
    const run = Render().runTask('upload', '上传中', () => pending.promise);
    hooks.cleanups.forEach((cleanup) => cleanup());
    pending.finish('/old-asset.png');
    expect(await run).toBeNull();
  });
});
