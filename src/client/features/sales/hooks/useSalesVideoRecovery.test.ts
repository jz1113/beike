import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollSalesVideoTask } from '../api/salesVideoPolling';
import { emptySalesProductionPlan, parseSalesProductionPlan } from '../model/salesProductionDraft';
import { patchSalesProductionPlan } from '../model/salesProductionOutputs';
import { useSalesProductionTask } from './useSalesProductionTask';
import { useSalesVideoRecovery } from './useSalesVideoRecovery';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: new Map<number, () => void | (() => void)>(), pending: [] as number[], cleanups: new Map<number, () => void>() }));
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
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.slots[index] = deps;
      hooks.effects.set(index, effect);
      hooks.pending.push(index);
    }
  },
}));
vi.mock('../api/salesVideoPolling', () => ({ pollSalesVideoTask: vi.fn() }));

const receipt = { taskId: 'original-task', model: 'wan3.0-video', modelSelection: 'wan-channel', sourceKey: 'original-inputs' };
let plan = emptySalesProductionPlan();
let sourceKey = receipt.sourceKey;
let ready = true;
const onRecovered = vi.fn();
const patchPlan = vi.fn((patch: Partial<typeof plan>) => { plan = patchSalesProductionPlan(plan, patch); });

function runEffects(indices = hooks.pending.splice(0)) {
  for (const index of indices) {
    hooks.cleanups.get(index)?.();
    hooks.cleanups.delete(index);
    const cleanup = hooks.effects.get(index)?.();
    if (cleanup) hooks.cleanups.set(index, cleanup);
  }
}
function Render(contextKey = sourceKey) {
  hooks.index = 0;
  const task = useSalesProductionTask(contextKey);
  const recovery = useSalesVideoRecovery({ plan, sourceKey, ready, busy: task.busy, patchPlan, runTask: task.runTask, onRecovered });
  runEffects();
  return { ...task, ...recovery };
}
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
function deferred() {
  let finish!: (value: { taskId: string; videoUrl: string }) => void;
  const promise = new Promise<{ taskId: string; videoUrl: string }>((resolve) => { finish = resolve; });
  return { promise, finish };
}

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects.clear(); hooks.pending = []; hooks.cleanups.clear();
  vi.clearAllMocks();
  sourceKey = receipt.sourceKey; ready = true;
  plan = parseSalesProductionPlan(JSON.parse(JSON.stringify({ ...emptySalesProductionPlan(), pendingVideoTask: receipt })));
  vi.mocked(pollSalesVideoTask).mockResolvedValue({ taskId: receipt.taskId, videoUrl: '/recovered.mp4' });
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); });

describe('production video recovery', () => {
  it('queries the persisted task with its original route after reload and restores the preview', async () => {
    Render(); await settle();

    expect(pollSalesVideoTask).toHaveBeenCalledTimes(1);
    expect(pollSalesVideoTask).toHaveBeenCalledWith(receipt, expect.any(Function), expect.any(AbortSignal), expect.any(Function));
    expect(plan).toMatchObject({ generatedVideoUrl: '/recovered.mp4', generatedVideoTaskId: receipt.taskId, mixedVideoUrl: '', pendingVideoTask: null });
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('waits for current scripts and materials before reconnecting a receipt', async () => {
    ready = false;
    Render(); await settle();
    expect(pollSalesVideoTask).not.toHaveBeenCalled();
    ready = true;
    Render(); await settle();
    expect(pollSalesVideoTask).toHaveBeenCalledTimes(1);
  });

  it('leaves unmatched input receipts and existing previews untouched', async () => {
    sourceKey = 'another-product-inputs';
    Render(); await settle();
    expect(pollSalesVideoTask).not.toHaveBeenCalled();
    sourceKey = receipt.sourceKey;
    plan = { ...plan, generatedVideoUrl: '/already-finished.mp4' };
    Render(); await settle();
    expect(pollSalesVideoTask).not.toHaveBeenCalled();
    expect(plan.generatedVideoUrl).toBe('/already-finished.mp4');
  });

  it('saves an accepted receipt without credentials and ignores callbacks belonging to older inputs', () => {
    plan = emptySalesProductionPlan();
    const remember = Render().rememberVideoTask;
    remember({ taskId: receipt.taskId, model: receipt.model, modelSelection: receipt.modelSelection });
    expect(plan.pendingVideoTask).toEqual(receipt);
    sourceKey = 'changed-inputs';
    Render();
    patchPlan.mockClear();
    remember({ taskId: 'late-task', model: receipt.model, modelSelection: receipt.modelSelection });
    expect(patchPlan).not.toHaveBeenCalled();
  });

  it('does not resume again after cancellation or publish a late result', async () => {
    const pending = deferred();
    vi.mocked(pollSalesVideoTask).mockReturnValue(pending.promise);
    Render(); await settle();
    Render().cancel();
    Render();
    pending.finish({ taskId: receipt.taskId, videoUrl: '/late.mp4' });
    await settle(); Render(); await settle();
    expect(pollSalesVideoTask).toHaveBeenCalledTimes(1);
    expect(plan.generatedVideoUrl).toBe('');
    expect(plan.pendingVideoTask).toEqual(receipt);
  });

  it('does not restart a directly submitted task after its receipt is saved and waiting is cancelled', async () => {
    plan = emptySalesProductionPlan();
    const pending = deferred();
    const current = Render();
    const direct = current.runTask('video', '正在提交视频…', () => pending.promise);
    current.rememberVideoTask({ taskId: receipt.taskId, model: receipt.model, modelSelection: receipt.modelSelection });
    expect(Render().busy).toBe('video');
    await settle();
    expect(pollSalesVideoTask).not.toHaveBeenCalled();

    Render().cancel();
    Render();
    pending.finish({ taskId: receipt.taskId, videoUrl: '/cancelled-direct.mp4' });
    expect(await direct).toBeNull();
    await settle(); Render(); await settle();

    expect(pollSalesVideoTask).not.toHaveBeenCalled();
    expect(plan).toMatchObject({ pendingVideoTask: receipt, generatedVideoUrl: '' });
  });

  it('stops after a permanent error and keeps the task available for a later reload', async () => {
    vi.mocked(pollSalesVideoTask).mockRejectedValue(new Error('任务查询无权限'));
    Render(); await settle();
    expect(Render().error).toContain('无权限');
    await settle(); Render(); await settle();
    expect(pollSalesVideoTask).toHaveBeenCalledTimes(1);
    expect(plan.pendingVideoTask).toEqual(receipt);
  });

  it('discards a result after the product or generation inputs change', async () => {
    const pending = deferred();
    vi.mocked(pollSalesVideoTask).mockReturnValue(pending.promise);
    Render(); await settle();
    const signal = vi.mocked(pollSalesVideoTask).mock.calls[0][2];
    sourceKey = 'new-product-inputs';
    Render();
    expect(signal.aborted).toBe(true);
    pending.finish({ taskId: receipt.taskId, videoUrl: '/wrong-product.mp4' });
    await settle();
    expect(plan.generatedVideoUrl).toBe('');
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('checks source identity again before attaching a successful result even when its request was not aborted', async () => {
    const pending = deferred();
    vi.mocked(pollSalesVideoTask).mockReturnValue(pending.promise);
    Render('unchanged-task-context'); await settle();
    const signal = vi.mocked(pollSalesVideoTask).mock.calls[0][2];
    sourceKey = 'updated-resolved-materials';
    Render('unchanged-task-context');
    expect(signal.aborted).toBe(false);

    pending.finish({ taskId: receipt.taskId, videoUrl: '/outdated-inputs.mp4' });
    await settle();

    expect(plan.generatedVideoUrl).toBe('');
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('starts one surviving query when StrictMode replays the initial effects', async () => {
    Render();
    runEffects([...hooks.effects.keys()]);
    await settle();
    expect(pollSalesVideoTask).toHaveBeenCalledTimes(1);
    expect(plan.generatedVideoUrl).toBe('/recovered.mp4');
  });
});
