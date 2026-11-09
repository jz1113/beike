import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { createUsageScope } from '@client/shared/utils/usageScope';
import { clearUsageLogs, getUsageLogs, getUsageSummary } from '@client/shared/utils/usageTracker';
import { pollGenerationTask, pollSingleTaskResult, recordSharedImageUsage, submitImageGenTaskResult } from './generationApi';

vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(),
  readClientStorageConfig: () => ({}),
  storageConfigHeaders: () => ({ 'x-storage': 'configured' }),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: vi.fn(() => ({ 'x-custom-base-url': 'https://selected.example', 'x-custom-api-key': 'selected-key' })),
  getGatewayClientOverrides: () => ({}),
  getModelCredentials: () => ({}),
  getMultimodalClientOverrides: () => ({}),
}));
vi.mock('./generationAbort', async original => ({
  ...await original<typeof import('./generationAbort')>(),
  sleepWhilePolling: async () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); },
    removeItem: (k: string) => { values.delete(k); },
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
    success: true, status: 'SUCCESS', resultUrl: 'https://images.example/result.png',
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe('image task query routing', () => {
  it.each(['image', 'video'] as const)('preserves selected model credentials for %s tasks', async mediaType => {
    await pollGenerationTask('original/task', mediaType, 'openai/gpt-image-2');
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('openai/gpt-image-2');
    expect(apiFetch).toHaveBeenCalledWith(`/api/generate/${mediaType}?taskId=original%2Ftask&model=openai%2Fgpt-image-2`, {
      headers: { 'x-custom-base-url': 'https://selected.example', 'x-custom-api-key': 'selected-key', 'x-storage': 'configured' },
    });
  });

  it('keeps the original model route throughout image polling', async () => {
    await expect(pollSingleTaskResult('original/task', () => false, undefined, 'openai/gpt-image-2'))
      .resolves.toEqual({ url: 'https://images.example/result.png', temporary: false });
    expect(apiFetch).toHaveBeenCalledWith('/api/generate/image?taskId=original%2Ftask&model=openai%2Fgpt-image-2', expect.objectContaining({
      headers: expect.objectContaining({ 'x-custom-api-key': 'selected-key' }),
    }));
  });

  it('preserves a selected channel independently from the upstream model and forwards cancellation', async () => {
    const signal = new AbortController().signal;
    await pollGenerationTask('task', 'video', 'doubao-seedance-2.5', { modelSelection: 'channel-b', signal });
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('channel-b');
    expect(apiFetch).toHaveBeenCalledWith('/api/generate/video?taskId=task&model=doubao-seedance-2.5', expect.objectContaining({ signal }));
  });

  it('sends the immutable server record alongside the provider ID when resuming an old video', async () => {
    await pollGenerationTask('same-provider-id', 'video', 'wan3.0-video', { modelSelection: 'original-channel', recordId: 'original-record' });
    expect(apiFetch).toHaveBeenCalledWith('/api/generate/video?taskId=same-provider-id&model=wan3.0-video', expect.objectContaining({
      headers: expect.objectContaining({ 'x-task-record-id': 'original-record', 'x-custom-api-key': 'selected-key' }),
    }));
  });
});

describe('shared image usage accounting', () => {
  it('P2 accepted submission and paid failure retain billing without a successful image', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, taskId: 'remote', recordId: 'record', status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(Response.json({ status: 'FAILURE', failReason: 'paid failure', usage: { totalTokens: 7 } }));
    await expect(submitImageGenTaskResult({ model: 'gpt-image-2' }, { idempotencyKey: 'op', isAborted: () => false })).rejects.toThrow('paid failure');
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, billableCount: 1, totalTokens: 7, recordId: 'record', localTaskId: 'op' });
    expect(getUsageSummary('today').imageCount).toBe(0);
  });

  it('P2 pending partial usage promotes once on confirmed output and ignores replay after clear', async () => {
    const context = { modelId: 'gpt-image-2', scope: createUsageScope('image'), localTaskId: 'op', recordId: 'record' };
    recordSharedImageUsage({ status: 'IN_PROGRESS', usage: { promptTokens: 3 } }, context);
    expect(getUsageSummary('today').imageCount).toBe(0);
    const complete = { status: 'SUCCESS', resultUrl: '/image.png', usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } };
    recordSharedImageUsage(complete, context);
    recordSharedImageUsage(complete, context);
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageSummary('today')).toMatchObject({ imageCount: 1, totalTokens: 7 });
    clearUsageLogs();
    recordSharedImageUsage(complete, context);
    expect(getUsageLogs()).toEqual([]);
    recordSharedImageUsage(complete, { ...context, localTaskId: 'new-op', recordId: 'new-record', scope: createUsageScope('image') });
    expect(getUsageSummary('today').imageCount).toBe(1);
  });

  it('P2 persists record-only synchronous receipts and blocks polling when durability fails', async () => {
    const prepared = vi.fn();
    const receipt = vi.fn().mockRejectedValue(new Error('quota'));
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, status: 'SUCCESS', recordId: 'record', resultUrl: '/image.png' }));
    await expect(submitImageGenTaskResult({ model: 'gpt-image-2' }, { idempotencyKey: 'op', isAborted: () => false, onUsagePrepared: prepared, onReceipt: receipt })).rejects.toThrow('保存未确认');
    expect(prepared.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(apiFetch).mock.invocationCallOrder[0]);
    expect(receipt).toHaveBeenCalledWith({ recordId: 'record', scope: expect.objectContaining({ epoch: 'initial' }) });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('P2 checkpoints the original record before asynchronous polling', async () => {
    const receipt = vi.fn();
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, status: 'IN_PROGRESS', taskId: 'remote', recordId: 'record' }))
      .mockResolvedValueOnce(Response.json({ status: 'SUCCESS', resultUrl: '/image.png' }));
    await submitImageGenTaskResult({ model: 'gpt-image-2' }, { idempotencyKey: 'op', isAborted: () => false, onReceipt: receipt });
    expect(receipt.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(apiFetch).mock.invocationCallOrder[1]);
    expect(vi.mocked(apiFetch).mock.calls[1][1]?.headers).toHaveProperty('x-task-record-id', 'record');
    expect(getUsageLogs()[0]).toMatchObject({ recordId: 'record', localTaskId: 'op', mediaCount: 1 });
  });

  it('P2 bare historical task replay after clear does not invent a new epoch', async () => {
    clearUsageLogs();
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', resultUrl: '/old.png', usage: { totalTokens: 8 } }));
    await pollSingleTaskResult('old-remote', () => false, undefined, 'gpt-image-2');
    expect(getUsageLogs()).toEqual([]);
    const scope = createUsageScope('image');
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', resultUrl: '/new.png', usage: { totalTokens: 3 } }));
    await pollSingleTaskResult('new-remote', () => false, undefined, 'gpt-image-2', { headers: {}, scope, localTaskId: 'new-operation' });
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0].totalTokens).toBe(3);
  });
});
