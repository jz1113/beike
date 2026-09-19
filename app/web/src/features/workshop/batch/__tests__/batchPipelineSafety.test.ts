import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/apiClient';
import { pollSingleTask, submitImageGenTask } from '../batchImageTasks';
import { startAutoPilotPipeline, type AutoPilotDeps } from '../batchAutoPilot';
import { buildMatrixExportRows } from '../batchRunnerExport';
import { parseBatchInputLines } from '../batchCollect';
import type { BatchProductItem } from '../batchTypes';
vi.mock('@/lib/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/gatewayClient', () => ({ getGatewayClientHeaders: () => ({}), getGatewayClientOverrides: () => ({}) }));
vi.mock('@/lib/usageTracker', () => ({ recordModelUsage: vi.fn(), resolveModelVendor: () => 'test' }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('marks a poll timeout non-retryable and retains the upstream task ID', async () => {
  vi.useFakeTimers();
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, status: 'IN_PROGRESS' }));
  const pending = expect(pollSingleTask('upstream-123', () => false)).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('upstream-123') });
  await vi.advanceTimersByTimeAsync(360000);
  await pending;
});
it('does not submit a new image after stop', async () => {
  await expect(submitImageGenTask({ model: 'test' }, { isAborted: () => true })).rejects.toMatchObject({ retryable: false });
  expect(apiFetch).not.toHaveBeenCalled();
});
it('keeps waiting for an already submitted task after stopping subsequent tasks', async () => {
  vi.useFakeTimers(); let stopped = false;
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { stopped = true; return Response.json({ success: true, taskId: 'accepted' }); }
    return Response.json({ success: true, status: 'SUCCESS', resultUrl: 'saved-result' });
  });
  const pending = submitImageGenTask({ model: 'test' }, { isAborted: () => stopped });
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe('saved-result');
  expect(vi.mocked(apiFetch).mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
});
it('does not automatically retry a success envelope without a result or task ID', async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true }));
  await expect(submitImageGenTask({}, { isAborted: () => false })).rejects.toMatchObject({ retryable: false });
});
function autoDeps(): AutoPilotDeps {
  let items = [{ id: 'one', selected: true, status: 'success', selectedProductImages: ['product'], analyzedSuccess: true, prompts: [{ prompt: 'ready' }] }] as BatchProductItem[];
  return { successfulItems: items, getItems: () => items, setItems: update => { items = typeof update === 'function' ? update(items) : update; },
    startBatchVisionAnalyze: vi.fn(async () => 1), startBatchGeneration: vi.fn(async () => {}), generateAllCopywriting: vi.fn(async () => {}), setCurrentStage: vi.fn(), showToast: vi.fn(), setIsAutoPilotRunning: vi.fn(), batchMode: 'original' };
}
it('stops autopilot at the boundary before generation', async () => {
  const deps = autoDeps(); deps.isAborted = () => true;
  await startAutoPilotPipeline(deps);
  expect(deps.startBatchGeneration).not.toHaveBeenCalled();
  expect(deps.setIsAutoPilotRunning).toHaveBeenLastCalledWith(false);
});
it('lands on prompt review after failed analysis', async () => {
  const deps = autoDeps(); deps.startBatchVisionAnalyze = vi.fn(async () => 0);
  await startAutoPilotPipeline(deps);
  expect(deps.setCurrentStage).toHaveBeenCalledWith(3);
  expect(deps.startBatchGeneration).not.toHaveBeenCalled();
});
it('leaves omitted storyboard slots empty instead of repeating another image', async () => {
  const rows = await buildMatrixExportRows([{ id: 'one', itemId: 'one', title: 'one', tasks: [
    { shot_no: 2, status: 'SUCCESS', resultUrl: 'second' }, { shot_no: 4, status: 'SUCCESS', resultUrl: 'fourth' },
  ] }] as BatchProductItem[], undefined, { offline: true });
  expect(rows[0]).toMatchObject({ '图链接1': '', '图链接2': 'second', '图链接3': '', '图链接4': 'fourth' });
});
it('deduplicates product IDs within their platform, not across unrelated shops', () => {
  const result = parseBatchInputLines('https://item.jd.com/123456789.html\nhttps://item.taobao.com/item.htm?id=123456789\nhttps://item.jd.com/123456789.html', new Set());
  expect(result.newItems.map(i => i.platform)).toEqual(['jd', 'taobao']);
  expect(parseBatchInputLines('https://item.taobao.com/item.htm?id=123456789', new Set(['jd:123456789'])).newItems).toHaveLength(1);
});
