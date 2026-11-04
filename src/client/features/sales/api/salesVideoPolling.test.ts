import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { apiFetch } from '@client/shared/api/apiClient';
import { pollGenerationTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import { submitAndPollSalesVideo } from './salesProduction';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), readClientStorageConfig: () => ({}), storageConfigHeaders: () => ({}),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: () => ({ 'x-custom-api-key': 'selected-wan-channel' }),
  getMultimodalClientOverrides: () => ({}),
}));
vi.mock('@client/shared/api/generation/generationApi', () => ({ pollGenerationTask: vi.fn() }));
vi.mock('@client/shared/api/generation/generationAbort', () => ({ sleepWhilePolling: vi.fn() }));

const input = {
  prompt: '展示当前商品', model: 'wan-channel', durationSec: 14,
  aspectRatio: '9:16', resolution: '480P', images: ['/product.jpg'], generateAudio: false,
};
const result = { status: 'SUCCESS', resultUrl: '/finished.mp4' };
let now = 0;

beforeEach(() => {
  vi.resetAllMocks();
  const storage = new Map([[getModalityStorageKey('video'), JSON.stringify([
    { id: 'wan-channel', modelId: 'wan3.0-video', name: '万相渠道', channelId: 'wan-provider' },
  ])]]);
  configureDomainRuntime({ storage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  } });
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.mocked(sleepWhilePolling).mockImplementation(async (ms) => { now += ms; });
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
    success: true, taskId: 'original-wan-task', status: 'PENDING',
  })));
});

afterEach(() => { vi.restoreAllMocks(); configureDomainRuntime({ storage: null }); });

function expectOriginalTask(signal: AbortSignal) {
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ model: 'wan3.0-video' });
  for (const args of vi.mocked(pollGenerationTask).mock.calls) {
    expect(args).toEqual(['original-wan-task', 'video', 'wan3.0-video', { modelSelection: 'wan-channel', signal }]);
  }
}

describe('slow Wan video polling', () => {
  it('checkpoints the exact task and channel before querying the accepted generation', async () => {
    const saved = vi.fn();
    vi.mocked(pollGenerationTask).mockImplementation(async () => {
      expect(saved).toHaveBeenCalledWith({ taskId: 'original-wan-task', model: 'wan3.0-video', modelSelection: 'wan-channel' });
      return result;
    });

    await expect(submitAndPollSalesVideo(input, () => {}, new AbortController().signal, saved))
      .resolves.toEqual({ videoUrl: '/finished.mp4', taskId: 'original-wan-task' });

    expect(saved).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows the channel ID as soon as the background job receives it and keeps polling the local job', async () => {
    const id = 'sales_media_42';
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, job: { id } }));
    const job = { id, status: 'running', result: { taskId: 'channel-17', stage: '渠道生成中 32%' } };
    vi.mocked(apiRequest).mockResolvedValueOnce(Response.json({ job }))
      .mockResolvedValueOnce(Response.json({ job: { ...job, status: 'completed', result: { ...job.result, resultUrl: '/done.mp4' } } }));
    const receipt = vi.fn();
    const progress = vi.fn();
    const signal = new AbortController().signal;
    await expect(submitAndPollSalesVideo(input, progress, signal, receipt))
      .resolves.toEqual({ videoUrl: '/done.mp4', taskId: id, channelTaskId: 'channel-17' });
    expect(receipt).toHaveBeenCalledTimes(2);
    expect(receipt).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: id, channelTaskId: 'channel-17' }));
    expect(progress).toHaveBeenCalledWith('渠道生成中 32%');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/sales/media-jobs', expect.objectContaining({ search: 'id=' + id }));
  });

  it('keeps a queued task alive beyond eight minutes and eventually returns its video', async () => {
    const startedAt = now;
    vi.mocked(pollGenerationTask).mockImplementation(async () =>
      now - startedAt >= 12 * 60_000 ? result : { status: 'PENDING' });
    const signal = new AbortController().signal;
    const progress = vi.fn();

    await expect(submitAndPollSalesVideo(input, progress, signal))
      .resolves.toEqual({ videoUrl: '/finished.mp4', taskId: 'original-wan-task' });

    expect(now - startedAt).toBeGreaterThanOrEqual(12 * 60_000);
    expect(progress).toHaveBeenCalledWith(expect.stringContaining('已等待 720s'));
    expect(vi.mocked(sleepWhilePolling).mock.calls.some(([ms]) => ms >= 10_000)).toBe(true);
    expectOriginalTask(signal);
  });

  it('recovers from repeated gateway and network errors without submitting another video', async () => {
    const errors = [
      new Error('轮询失败 (502)'), new TypeError('Failed to fetch'),
      new Error('轮询失败 (408)'), new Error('轮询失败 (429)'),
      new Error('轮询失败 (503)'), new Error('轮询失败 (502)'),
    ];
    for (const error of errors) vi.mocked(pollGenerationTask).mockRejectedValueOnce(error);
    vi.mocked(pollGenerationTask).mockResolvedValueOnce(result);
    const signal = new AbortController().signal;

    await expect(submitAndPollSalesVideo(input, () => {}, signal))
      .resolves.toEqual({ videoUrl: '/finished.mp4', taskId: 'original-wan-task' });

    expect(pollGenerationTask).toHaveBeenCalledTimes(errors.length + 1);
    const delays = vi.mocked(sleepWhilePolling).mock.calls.map(([ms]) => ms);
    expect(Math.max(...delays)).toBe(30_000);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expectOriginalTask(signal);
  });

  it.each([
    { status: 'QUERY_FAILED', error: '暂时无法查询' },
    { status: 'IN_PROGRESS', retryable: true, failReason: '云端暂时不可用' },
  ])('retries an HTTP 200 query failure: %j', async (temporary) => {
    for (let i = 0; i < 5; i += 1) vi.mocked(pollGenerationTask).mockResolvedValueOnce(temporary);
    vi.mocked(pollGenerationTask).mockResolvedValueOnce(result);
    const signal = new AbortController().signal;
    const progress = vi.fn();

    await expect(submitAndPollSalesVideo(input, progress, signal))
      .resolves.toEqual({ videoUrl: '/finished.mp4', taskId: 'original-wan-task' });

    expect(progress).toHaveBeenCalledWith(expect.stringContaining('正在重试'));
    expect(pollGenerationTask).toHaveBeenCalledTimes(6);
    expectOriginalTask(signal);
  });

  it('resets retry backoff after a healthy query and includes request time in the wait display', async () => {
    vi.mocked(pollGenerationTask)
      .mockImplementationOnce(async () => { now += 20_000; throw new Error('轮询失败 (502)'); })
      .mockResolvedValueOnce({ status: 'IN_PROGRESS' })
      .mockRejectedValueOnce(new Error('轮询失败 (502)'))
      .mockResolvedValueOnce(result);
    const signal = new AbortController().signal;
    const progress = vi.fn();

    await expect(submitAndPollSalesVideo(input, progress, signal))
      .resolves.toEqual({ videoUrl: '/finished.mp4', taskId: 'original-wan-task' });

    expect(vi.mocked(sleepWhilePolling).mock.calls.map(([ms]) => ms)).toEqual([3000, 6000, 3000, 6000]);
    expect(progress).toHaveBeenCalledWith(expect.stringContaining('已等待 23s'));
    expectOriginalTask(signal);
  });

  it.each(['pending', 'query error'])('stops before another query when cancelled during a %s wait', async (state) => {
    const controller = new AbortController();
    if (state === 'pending') vi.mocked(pollGenerationTask).mockResolvedValue({ status: 'PENDING' });
    else vi.mocked(pollGenerationTask).mockRejectedValue(new TypeError('Failed to fetch'));
    let sleeps = 0;
    vi.mocked(sleepWhilePolling).mockImplementation(async (ms) => {
      now += ms;
      sleeps += 1;
      if (sleeps === 4) controller.abort();
    });

    await expect(submitAndPollSalesVideo(input, () => {}, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });

    expect(pollGenerationTask).toHaveBeenCalledTimes(3);
    expectOriginalTask(controller.signal);
  });

  it('stops immediately when the cloud confirms that generation failed', async () => {
    vi.mocked(pollGenerationTask)
      .mockResolvedValueOnce({ status: 'FAILURE', failReason: '参考素材审核失败' })
      .mockResolvedValueOnce(result);
    const signal = new AbortController().signal;

    await expect(submitAndPollSalesVideo(input, () => {}, signal)).rejects.toThrow('参考素材审核失败');

    expect(pollGenerationTask).toHaveBeenCalledTimes(1);
    expectOriginalTask(signal);
  });
});
