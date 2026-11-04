import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesPromptRequestError } from '../api/salesPrompts';
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
    reject(new SalesPromptRequestError('过期错误', 400, 'spoken-review'));
    await oldRun;
    expect(Render()).toMatchObject({ error: '', errorPromptId: '', busy: 'video' });
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

describe('storyboard rewrite result notices', () => {
  it('announces success only when the complete current rewrite finishes', async () => {
    const pending = deferred();
    const request = Render().runTask('adapt', '改写中', () => pending.promise);
    expect(Render()).toMatchObject({ busy: 'adapt', notice: '', error: '' });
    pending.finish('完整分镜');
    expect(await request).toBe('完整分镜');
    expect(Render()).toMatchObject({ busy: '', notice: '分镜改写成功，已更新本次分镜。', error: '' });
  });

  it('identifies a failed rewrite and retains its concrete failure reason', async () => {
    await Render().runTask('adapt', '改写中', async () => { throw new Error('模型连接超时'); });
    expect(Render().error).toContain('分镜改写失败：');
    expect(Render().error).toContain('模型连接超时');
    expect(Render()).toMatchObject({ busy: '', notice: '' });
  });

  it.each([
    '请先在提示词管理中保存「口播语义验收」，再按商品自动改写；原分镜已保留。',
    '口播时长适配返回结构不完整，原分镜已保留，请重试。',
    '请先在提示词管理中保存「口播语义验收」；原分镜和手工台词已保留。',
    '口播语义验收未完成，原稿已保留：请检查渠道配置。',
  ])('keeps preservation and recovery instructions without repeating them: %s', async (reason) => {
    await Render().runTask('adapt', '改写中', async () => { throw new Error(reason); });
    expect(Render().error).toBe(`分镜改写失败：${reason}`);
    expect(Render().error.match(/已保留/gu)).toHaveLength(1);
    expect(Render().error).not.toMatch(/[。.；;]；/u);
  });

  it.each(['。', '.', '；', ';'])('adds a single preservation notice after a punctuated failure: %s', async (punctuation) => {
    await Render().runTask('adapt', '改写中', async () => { throw new Error(`模型连接超时${punctuation}`); });
    expect(Render().error).toBe('分镜改写失败：模型连接超时；原分镜已保留，可重试。');
  });

  it('exposes a missing prompt and clears its action when the error is dismissed or a new task starts', async () => {
    const fail = async () => { throw new SalesPromptRequestError('请先保存「口播语义验收」；原分镜已保留。', 400, 'spoken-review'); };
    await Render().runTask('adapt', '改写中', fail);
    expect(Render()).toMatchObject({ errorPromptId: 'spoken-review', error: '分镜改写失败：请先保存「口播语义验收」；原分镜已保留。' });
    Render().setError('');
    expect(Render()).toMatchObject({ error: '', errorPromptId: '' });
    await Render().runTask('adapt', '改写中', fail);
    const pending = deferred();
    const request = Render().runTask('adapt', '重新改写', () => pending.promise);
    expect(Render()).toMatchObject({ error: '', errorPromptId: '', busy: 'adapt' });
    pending.finish('当前稿件');
    await request;
  });

  it('clears the missing prompt action when a draft change replaces its error', async () => {
    const pending = deferred();
    const request = Render().runTask('adapt', '改写中', () => pending.promise);
    Render().setError('请先保存提示词', 'spoken-review');
    expect(Render().errorPromptId).toBe('spoken-review');
    Render('product-b:script-2');
    expect(Render('product-b:script-2')).toMatchObject({ errorPromptId: '', busy: '' });
    expect(Render('product-b:script-2').error).toContain('方案已更新');
    pending.finish('旧分镜');
    expect(await request).toBeNull();
  });

  it('announces cancellation and never changes it to success after a late response', async () => {
    const pending = deferred();
    const request = Render().runTask('adapt', '改写中', () => pending.promise);
    Render().cancel();
    expect(Render()).toMatchObject({ busy: '', notice: '已停止分镜改写，原分镜已保留。', error: '' });
    pending.finish('取消后的旧分镜');
    expect(await request).toBeNull();
    expect(Render()).toMatchObject({ notice: '已停止分镜改写，原分镜已保留。', error: '' });
  });

  it('clears the previous result when a new task starts and allows dismissing success', async () => {
    await Render().runTask('adapt', '第一次改写', async () => '第一稿');
    expect(Render().notice).toContain('分镜改写成功');
    const pending = deferred();
    const request = Render().runTask('adapt', '重新改写', () => pending.promise);
    expect(Render()).toMatchObject({ busy: 'adapt', notice: '', error: '' });
    pending.finish('第二稿');
    await request;
    Render().clearNotice();
    expect(Render()).toMatchObject({ notice: '', error: '' });
  });

  it('keeps the latest success when a canceled rewrite later rejects', async () => {
    let reject!: (reason: Error) => void;
    const oldRequest = Render().runTask('adapt', '旧改写', () => new Promise<string>((_resolve, fail) => { reject = fail; }));
    Render().cancel();
    await Render().runTask('adapt', '新改写', async () => '新分镜');
    reject(new Error('过期改写失败'));
    expect(await oldRequest).toBeNull();
    expect(Render()).toMatchObject({ busy: '', notice: '分镜改写成功，已更新本次分镜。', error: '' });
  });

  it('replaces a previous success with a validation error without restoring success after dismissal', async () => {
    await Render().runTask('adapt', '改写中', async () => '当前分镜');
    expect(Render().notice).toContain('分镜改写成功');
    Render().setError('资料错误');
    expect(Render()).toMatchObject({ notice: '', error: '资料错误' });
    Render().setError('');
    expect(Render()).toMatchObject({ notice: '', error: '' });
  });

  it('does not announce success for a rewrite made obsolete by changed product inputs', async () => {
    const pending = deferred();
    const request = Render().runTask('adapt', '改写中', () => pending.promise);
    Render('product-b:script-2');
    pending.finish('旧商品分镜');
    expect(await request).toBeNull();
    const current = Render('product-b:script-2');
    expect(current.error).toContain('方案已更新');
    expect(current.notice).not.toContain('成功');
    expect(current.busy).toBe('');
  });

  it('does not report rewrite success or cancellation for unrelated production tasks', async () => {
    await Render().runTask('video', '生成中', async () => '/video.mp4');
    expect(Render().notice).toBe('');
    const pending = deferred();
    const request = Render().runTask('upload', '上传中', () => pending.promise);
    Render().cancel();
    expect(Render().notice).toBe('');
    pending.finish('/upload.mp4');
    expect(await request).toBeNull();
  });
});
