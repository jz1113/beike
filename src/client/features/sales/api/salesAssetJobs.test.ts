import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { clearUsageLogs, getUsageLogs } from '@client/shared/utils/usageTracker';
import {
  listSalesAssetJobs,
  prepareSalesAssetUsage,
  readSalesAssetJob,
  recordSalesAssetUsage,
  submitSalesAssetJob,
  waitSalesAssetJob,
} from './salesAssetJobs';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ readClientStorageConfig: () => ({ provider: 'local' }), storageConfigHeaders: () => ({ 'x-storage-provider': 'local' }) }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getModelCredentials: () => ({ baseUrl: 'https://selected.example', apiKey: 'selected-key', protocol: 'template', requestTemplate: { path: '/generate' } }),
  getGatewayClientOverrides: () => ({ customBaseUrl: 'https://default.example', customApiKey: 'default-key' }),
  getGatewayClientHeaders: vi.fn(() => ({ 'x-custom-api-key': 'selected-key' })),
  getMultimodalClientOverrides: () => ({ customBaseUrl: 'https://vision.example', customApiKey: 'vision-key', textProtocol: 'anthropic' }),
}));
vi.mock('@shared/domain/models/workflowModelStorage', () => ({ selectedTextModel: () => ({ modelId: 'upstream-vision' }) }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ upstreamModalityModelId: () => 'upstream-image-model' }));
vi.mock('@shared/domain/media/imageCapabilities', () => ({ imageCapabilities: () => ({ resolutions: ['4K'], maxReferenceImages: 1 }) }));

const job = { id: 'job', key: 'same-key', kind: 'persona', assetId: 'persona', model: 'selected-route', status: 'queued', error: '', images: {}, createdAt: '2026-11-02', updatedAt: '2026-11-02' };
let store: Storage;
const headers = { 'x-custom-base-url': 'https://original.example', 'x-custom-api-key': 'original-secret' };
const usage = { promptTokens: 11, completionTokens: 7, totalTokens: 18 };
const imageReceipt = (stage: 'main' | 'views', success = true) => ({ stage, modelId: 'image-model', taskId: 'same-provider-id', recordId: `record-${stage}`, success, usage });
function usageJob(key = 'asset-op'): SalesAssetViewJob {
  return { id: 'job', key, kind: 'scene', assetId: 'asset', model: 'image-model', status: 'completed', error: '', images: {}, createdAt: '', updatedAt: '',
    usageScopes: prepareSalesAssetUsage(key, 'image-model', 'vision-model'),
    usageReceipts: [{ stage: 'analysis', modelId: 'vision-model', recordId: 'analysis-record', success: true, usage }, imageReceipt('main'), imageReceipt('views')] };
}

beforeEach(() => {
  vi.clearAllMocks();
  const data = new Map<string, string>();
  store = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); }, clear: () => data.clear() };
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('window', { dispatchEvent: () => true });
  store.setItem('beike_workspace_secret', 'workspace-one-secret-'.repeat(3));
  configureDomainRuntime({ storage: store });
  vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'selected-key' });
  vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, job })));
});
afterEach(() => { configureDomainRuntime({ storage: null }); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('sends the selected route credentials and upstream ID while preserving the original task checkpoint', async () => {
  const request = { key: 'same-key', model: 'selected-route', references: ['/main.jpg', '/face.jpg'], taskId: 'paid-task', recordId: 'original-record', resultUrl: '/grid.jpg' };
  await submitSalesAssetJob('persona', request, { name: '人物1' }, 'persona');
  const [method, path, options] = vi.mocked(apiRequest).mock.calls[0];
  expect([method, path]).toEqual(['POST', '/api/sales/asset-view-jobs']);
  expect(options?.headers).toMatchObject({ 'x-custom-api-key': 'selected-key', 'x-storage-provider': 'local' });
  expect(JSON.parse(String(options?.body))).toMatchObject({
    key: 'same-key', assetId: 'persona', checkpoint: { taskId: 'paid-task', recordId: 'original-record', resultUrl: '/grid.jpg' },
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

it('P2 accounts all three stages on POST, read and list replay exactly once per paid stage', async () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const completed = usageJob();
  vi.mocked(apiRequest).mockResolvedValueOnce(Response.json({ success: true, job: completed }))
    .mockResolvedValueOnce(Response.json({ success: true, job: completed }))
    .mockResolvedValueOnce(Response.json({ success: true, jobs: [completed] }));
  await submitSalesAssetJob('scene', { key: completed.key, model: 'image-model', references: ['/ref.png'], creation: { referenceImageUrl: '/ref.png' }, analysisModel: 'vision-model' }, {});
  const body = JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body));
  expect(body.generation.usageScopes).toEqual(completed.usageScopes);
  expect(JSON.stringify(body.generation.usageScopes)).not.toMatch(/original-secret|vision-key/);
  await readSalesAssetJob('job'); await listSalesAssetJobs();
  expect(getUsageLogs()).toHaveLength(3);
  expect(getUsageLogs().map(row => row.totalTokens)).toEqual([18, 18, 18]);
  expect(getUsageLogs().filter(row => row.type === 'image').map(row => row.mediaCount)).toEqual([1, 1]);
});

it('P2 recovers the frozen stage attribution after the first response was lost and the channel changed', async () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const completed = usageJob();
  vi.mocked(apiRequest).mockRejectedValueOnce(new TypeError('lost first response'));
  const request = { key: completed.key, model: 'image-model', references: ['/ref.png'], creation: { referenceImageUrl: '/ref.png' }, analysisModel: 'vision-model' };
  await expect(submitSalesAssetJob('scene', request, {})).rejects.toThrow('lost first response');
  vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'changed' });
  vi.mocked(apiRequest).mockImplementation(async () => Response.json({ success: true, jobs: [completed] }));
  await listSalesAssetJobs(); await listSalesAssetJobs();
  expect(getUsageLogs()).toHaveLength(3);
  expect(getUsageLogs().find(row => row.recordId === 'record-main')?.scope).toEqual(completed.usageScopes?.main);
  expect(vi.mocked(apiRequest).mock.calls.map(([method]) => method)).toEqual(['POST', 'GET', 'GET']);
});

it('P2 retains failed or pending paid usage and upgrades it to full successful output without duplication', () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const completed = usageJob();
  const partial = { ...completed, status: 'failed' as const, usageReceipts: [{ ...imageReceipt('views', false), usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 } }] };
  recordSalesAssetUsage(partial);
  expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, totalTokens: 4 });
  recordSalesAssetUsage({ ...completed, usageReceipts: [imageReceipt('views')] }); recordSalesAssetUsage(partial);
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, totalTokens: 18, recordId: 'record-views' });
});

it('P2 excludes pre-clear stage replays while allowing post-clear asset jobs', async () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const previous = usageJob(); recordSalesAssetUsage(previous); clearUsageLogs();
  vi.mocked(apiRequest).mockResolvedValue(Response.json({ success: true, jobs: [previous] }));
  await listSalesAssetJobs(); expect(getUsageLogs()).toEqual([]);
  recordSalesAssetUsage(usageJob('fresh-op')); expect(getUsageLogs()).toHaveLength(3);
});

it('P2 skips historical and foreign-workspace receipts rather than inventing current ownership', () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const original = usageJob(); recordSalesAssetUsage({ ...original, usageScopes: undefined });
  expect(getUsageLogs()).toEqual([]);
  store.setItem('beike_workspace_secret', 'workspace-two-secret-'.repeat(3));
  recordSalesAssetUsage(original); expect(getUsageLogs()).toEqual([]);
});

it('P2 isolates identical provider task numbers on distinct channels', () => {
  vi.mocked(getGatewayClientHeaders).mockReturnValue(headers);
  const original = usageJob(); recordSalesAssetUsage(original);
  vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'other-channel' });
  const other = usageJob('other-op'); recordSalesAssetUsage({ ...other, usageReceipts: [imageReceipt('views')] });
  expect(getUsageLogs()).toHaveLength(4);
  expect(getUsageLogs().filter(row => row.localTaskId?.endsWith('op')).map(row => row.scope?.channelId)).toHaveLength(2);
});
