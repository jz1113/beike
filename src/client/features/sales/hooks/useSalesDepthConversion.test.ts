import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitDepthVideo } from '@client/shared/api/generation/depthGeneration';
import { createSalesMaterial } from '../api/salesMaterials';
import { readSalesDepthReceipt, waitSalesDepthVideo } from '../api/salesDepth';
import { useSalesDepthConversion } from './useSalesDepthConversion';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
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
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => 'workspace-test' }));
vi.mock('@client/shared/api/generation/depthGeneration', () => ({ submitDepthVideo: vi.fn(), submitDepthImage: vi.fn() }));
vi.mock('../api/salesMaterials', () => ({ createSalesMaterial: vi.fn() }));
vi.mock('../api/salesDepth', () => ({ readSalesDepthReceipt: vi.fn(), waitSalesDepthVideo: vi.fn(), fetchSalesActionFile: vi.fn() }));
const storage = new Map<string, string>();
const onSaved = vi.fn();
const input = { file: new File(['video'], 'action.mp4', { type: 'video/mp4' }), video: true, name: '转身', description: '', style: 'mocap' as const, quality: 'standard' as const };
function Render() { hooks.index = 0; return useSalesDepthConversion(onSaved); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.cleanup = undefined;
  vi.resetAllMocks(); storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
});
afterEach(() => { hooks.cleanup?.(); vi.unstubAllGlobals(); });

describe('depth task recovery', () => {
  it('persists the operation before submission and recovers a lost response without resubmitting', async () => {
    vi.mocked(submitDepthVideo).mockImplementation(async (_file, _style, _quality, _signal, operationId) => {
      expect(JSON.parse(storage.get('beike_sales_depth_job_v1')!).job.operationId).toBe(operationId);
      throw new Error('响应中断');
    });
    await Render().start(input);
    const operationId = Render().job!.operationId;
    expect(Render().error).toBe('响应中断');
    expect(Render().busy).toBe(false);
    await Render().start(input);
    expect(submitDepthVideo).toHaveBeenCalledTimes(1);
    vi.mocked(readSalesDepthReceipt).mockResolvedValue({ taskId: 'original-task' });
    vi.mocked(waitSalesDepthVideo).mockResolvedValue('/depth.mp4');
    await Render().resume();
    expect(readSalesDepthReceipt).toHaveBeenCalledWith(true, operationId, expect.any(AbortSignal));
    expect(Render().job).toMatchObject({ operationId, resultUrl: '/depth.mp4' });
  });
  it('does not submit when the initial recovery key cannot be saved', async () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('quota'); });
    await Render().start(input);
    expect(submitDepthVideo).not.toHaveBeenCalled();
    expect(Render().job).toBeNull();
    expect(Render().error).toContain('尚未提交');
  });
  it('retains a completed result in memory if later disk writes fail', async () => {
    vi.mocked(submitDepthVideo).mockImplementation(async () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('quota'); });
      return { taskId: 'task' };
    });
    vi.mocked(waitSalesDepthVideo).mockResolvedValue('/complete.mp4');
    await Render().start(input);
    expect(Render().job).toMatchObject({ taskId: 'task', resultUrl: '/complete.mp4' });
    expect(Render().error).toContain('本机保存失败');
    await Render().save();
    expect(createSalesMaterial).toHaveBeenCalledWith('action', expect.objectContaining({ mediaUrl: '/complete.mp4' }), expect.any(AbortSignal));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('ignores late responses after reset and preserves a newer active conversion', async () => {
    let finishOld!: (value: { taskId: string }) => void;
    let finishNew!: (value: { taskId: string }) => void;
    vi.mocked(submitDepthVideo)
      .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { finishNew = resolve; }));
    const oldRun = Render().start(input);
    Render().reset();
    const newRun = Render().start({ ...input, name: '新任务' });
    finishOld({ taskId: 'old' }); await oldRun;
    expect(Render().busy).toBe(true);
    expect(Render().job?.name).toBe('新任务');
    vi.mocked(waitSalesDepthVideo).mockResolvedValue('/new.mp4');
    finishNew({ taskId: 'new' }); await newRun;
    expect(Render().job).toMatchObject({ taskId: 'new', resultUrl: '/new.mp4' });
  });
  it('ignores old polling progress after reset starts another conversion', async () => {
    let completeOld!: (url: string) => void;
    let reportOld!: (text: string) => void;
    vi.mocked(submitDepthVideo).mockResolvedValueOnce({ taskId: 'old' }).mockRejectedValueOnce(new Error('等待回执'));
    vi.mocked(waitSalesDepthVideo).mockImplementationOnce((_id, _signal, onProgress) => {
      reportOld = onProgress;
      return new Promise((resolve) => { completeOld = resolve; });
    });
    const oldRun = Render().start(input);
    await vi.waitFor(() => expect(waitSalesDepthVideo).toHaveBeenCalled());
    Render().reset();
    await Render().start({ ...input, name: '新任务' });
    const progress = Render().progress;
    reportOld('旧任务即将完成');
    completeOld('/old.mp4');
    await oldRun;
    expect(Render().progress).toBe(progress);
    expect(Render().job?.name).toBe('新任务');
    expect(Render().job?.resultUrl).toBeUndefined();
  });
});
