import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { listSalesAssetJobs, readSalesAssetJob, submitSalesAssetJob, waitSalesAssetJob } from './salesAssetJobs';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ readClientStorageConfig: () => ({ provider: 'local' }), storageConfigHeaders: () => ({ 'x-storage-provider': 'local' }) }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getModelCredentials: () => ({ baseUrl: 'https://selected.example', apiKey: 'selected-key', protocol: 'template', requestTemplate: { path: '/generate' } }),
  getGatewayClientOverrides: () => ({ customBaseUrl: 'https://default.example', customApiKey: 'default-key' }),
  getGatewayClientHeaders: () => ({ 'x-custom-api-key': 'selected-key' }),
  getMultimodalClientOverrides: () => ({ customBaseUrl: 'https://vision.example', customApiKey: 'vision-key', textProtocol: 'anthropic' }),
}));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: () => ({ modelId: 'upstream-vision' }) }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ upstreamModalityModelId: () => 'upstream-image-model' }));
vi.mock('./salesAssetViews', () => ({ gridImageSettings: () => ({ size: '3072x4096', aspectRatio: '3:4', quality: 'high', maxReferenceImages: 1 }) }));
const job = { id: 'job', key: 'same-key', kind: 'persona', assetId: 'persona', model: 'selected-route', status: 'queued', error: '', images: {}, createdAt: '2026-11-02', updatedAt: '2026-11-02' };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, job }))); });

it('sends the selected route credentials and upstream ID while preserving the original task checkpoint', async () => {
  const request = { key: 'same-key', model: 'selected-route', references: ['/main.jpg', '/face.jpg'], taskId: 'paid-task', resultUrl: '/grid.jpg' };
  await submitSalesAssetJob('persona', request, { name: '人物1' }, 'persona');
  const [method, path, options] = vi.mocked(apiRequest).mock.calls[0];
  expect([method, path]).toEqual(['POST', '/api/sales/asset-view-jobs']);
  expect(options?.headers).toMatchObject({ 'x-custom-api-key': 'selected-key', 'x-storage-provider': 'local' });
  expect(JSON.parse(String(options?.body))).toMatchObject({
    key: 'same-key', assetId: 'persona', checkpoint: { taskId: 'paid-task', resultUrl: '/grid.jpg' },
    generation: { model: 'upstream-image-model', modelSelection: 'selected-route', customBaseUrl: 'https://selected.example', customApiKey: 'selected-key', customProtocol: 'template', referenceImages: ['/main.jpg'], storageConfig: { provider: 'local' } },
  });
  expect(request).toMatchObject({ assetId: 'persona', jobId: 'job' });
});

it('refuses an incomplete queue receipt and surfaces a server failure without inventing a new task', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
  await expect(submitSalesAssetJob('persona', { key: 'same-key', model: 'selected-route', references: [] }, {})).rejects.toThrow('回执不完整');
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ error: '队列已满' }), { status: 429 }));
  await expect(submitSalesAssetJob('persona', { key: 'same-key', model: 'selected-route', references: [] }, {})).rejects.toThrow('队列已满');
});

it('loads persisted background progress and rejects malformed lists', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, jobs: [job] })));
  await expect(listSalesAssetJobs()).resolves.toEqual([job]);
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, jobs: [{ id: 'incomplete' }] })));
  await expect(listSalesAssetJobs()).rejects.toThrow('任务列表不完整');
});

it('explains how to recover when the frontend reaches an older backend without the job route', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: '接口不存在' }), { status: 404 }));
  await expect(listSalesAssetJobs()).rejects.toThrow('请重启贝壳服务后刷新');
});

it('preserves a missing-asset error instead of treating it as an outdated backend', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ error: '资产不存在或已删除' }), { status: 404 }));
  await expect(submitSalesAssetJob('persona', { key: 'same-key', model: 'selected-route', references: [] }, {}, 'removed')).rejects.toThrow('资产不存在或已删除');
});

it('sends the vision route separately and returns the actual drawing prompt with the generated image', async () => {
  const creation = { referenceImageUrl: '/reference.jpg', prompt: '自然光下的新人物', imageUrl: '/created.jpg', promptModel: 'vision-route', imageModel: 'selected-route' };
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, job: { ...job, status: 'creating', creation } })));
  const request = { key: 'same-key', model: 'selected-route', references: ['/reference.jpg'], analysisModel: 'vision-route', creation: { referenceImageUrl: '/reference.jpg' } };
  await submitSalesAssetJob('persona', request, { name: '人物1' });
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body)).generation.assetCreation).toEqual({
    referenceImageUrl: '/reference.jpg', analysisModel: 'upstream-vision', analysisModelSelection: 'vision-route',
    customBaseUrl: 'https://vision.example', customApiKey: 'vision-key', textProtocol: 'anthropic',
  });
  expect(request.creation).toEqual(creation);
});

it('reads one original job using the backend jobId query parameter', async () => {
  await readSalesAssetJob('original job');
  expect(apiRequest).toHaveBeenCalledWith('GET', '/api/sales/asset-view-jobs', expect.objectContaining({ search: 'jobId=original%20job', cache: 'no-store' }));
});

it('polls the same job through creation to completion and stops on cancellation', async () => {
  vi.useFakeTimers();
  try {
    const initial: SalesAssetViewJob = { ...job, kind: 'persona', status: 'creating' };
    const finished: SalesAssetViewJob = { ...initial, status: 'completed' };
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, job: finished })));
    const progress = vi.fn();
    const result = waitSalesAssetJob(initial, new AbortController().signal, progress);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toEqual(finished);
    expect(progress.mock.calls.map(([current]) => current.status)).toEqual(['creating', 'completed']);
    const controller = new AbortController();
    const canceled = waitSalesAssetJob(initial, controller.signal, progress);
    const rejected = expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
