import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { pollDepthVideoTask } from '@client/shared/api/generation/depthGeneration';
import { readSalesDepthReceipt, waitSalesDepthVideo } from './salesDepth';
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url }));
vi.mock('@client/shared/api/generation/depthGeneration', () => ({ pollDepthVideoTask: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it('recovers the original operation through a read-only receipt query', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: 'depth-1' })));
  const signal = new AbortController().signal;
  expect(await readSalesDepthReceipt(true, 'original key', signal)).toMatchObject({ taskId: 'depth-1' });
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/depth-video?taskKey=original%20key', { signal });
});
it('keeps unresolved submission errors visible and never automatically re-submits', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ status: 'QUERY_FAILED', error: '原结果待核对' })));
  await expect(readSalesDepthReceipt(false, 'key', new AbortController().signal)).rejects.toThrow('原结果待核对');
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
it('preserves backend failures and accepts a confirmed video result', async () => {
  const signal = new AbortController().signal;
  vi.mocked(pollDepthVideoTask).mockResolvedValueOnce({ status: 'FAILURE', failReason: '推理中断' });
  await expect(waitSalesDepthVideo('task', signal, () => {})).rejects.toThrow('推理中断');
  vi.mocked(pollDepthVideoTask).mockResolvedValueOnce({ status: 'SUCCESS', resultUrl: '/depth.mp4' });
  expect(await waitSalesDepthVideo('task', signal, () => {})).toBe('/depth.mp4');
  expect(pollDepthVideoTask).toHaveBeenLastCalledWith('task', signal);
});
