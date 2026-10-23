import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: fetch,
  readClientStorageConfig: () => ({ driver: 'local' }),
  storageConfigHeaders: () => ({ 'x-storage': 'local' }),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: (model?: string) => ({ 'x-custom-base-url': `https://${model}.example`, 'x-custom-api-key': 'model-key' }),
}));
vi.mock('@client/shared/api/generation/generationAbort', () => ({
  sleepWhilePolling: async () => undefined,
  throwIfGenerationAborted: () => undefined,
}));
import { generateSalesShotVideo, lookupSalesVideoSubmission } from './salesMediaApi';

beforeEach(() => fetch.mockReset());

describe('sales video channel and receipt', () => {
  it('submits with the selected model channel and the saved submission key', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, taskId: 'video-1', status: 'IN_PROGRESS' }) });
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'SUCCESS', resultUrl: 'https://cdn.example/final.mp4' }) });
    const url = await generateSalesShotVideo({
      prompt: '整段', videoModel: 'wan3.0-video', referenceImages: ['https://cdn.example/front.jpg'], keepAllImages: true,
      duration: 15, aspectRatio: '9:16', resolution: '720P', refMode: 'omni', submissionKey: 'saved-key', isAborted: () => false,
    });
    expect(url).toBe('https://cdn.example/final.mp4');
    const [, submit] = fetch.mock.calls[0];
    expect(submit.headers).toMatchObject({ 'x-custom-base-url': 'https://wan3.0-video.example', 'x-custom-api-key': 'model-key', 'x-idempotency-key': 'saved-key' });
    expect(JSON.parse(submit.body)).toMatchObject({ clientTaskId: 'saved-key', model: 'wan3.0-video', images: ['https://cdn.example/front.jpg'] });
    expect(JSON.parse(submit.body).customBaseUrl).toBeUndefined();
    expect(JSON.parse(submit.body).customApiKey).toBeUndefined();
    expect(String(fetch.mock.calls[1][0])).toContain('taskId=video-1');
    expect(String(fetch.mock.calls[1][0])).toContain('model=wan3.0-video');
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ 'x-custom-base-url': 'https://wan3.0-video.example' });
  });

  it('treats a missing receipt as safe to retry and a lookup outage as not missing', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false, error: '尚未找到原视频提交记录，请稍后核对；不会自动重新提交' }) });
    await expect(lookupSalesVideoSubmission('saved-key', 'wan3.0-video', () => false)).resolves.toMatchObject({ outcome: 'missing' });
    fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: '暂时无法核对' }) });
    await expect(lookupSalesVideoSubmission('saved-key', 'wan3.0-video', () => false)).resolves.toMatchObject({ outcome: 'pending' });
  });

  it('blocks a reference the video service cannot fetch before creating a task', async () => {
    await expect(generateSalesShotVideo({
      prompt: '整段', videoModel: 'wan3.0-video', referenceImages: ['blob:local'], duration: 15, isAborted: () => false,
    })).rejects.toThrow('公网地址或本地存储地址');
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('treats stopping an existing video as cancellation rather than a provider rejection', async () => {
  await expect(generateSalesShotVideo({ prompt: '', duration: 15, existingTaskId: 'paid-video', isAborted: () => true })).rejects.toMatchObject({ name: 'AbortError' });
});
