import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store';
import { apiFetch } from '@client/shared/api/apiClient';
import { getUsageLogs, getUsageSummary } from '@client/shared/utils/usageTracker';
import { recordSubmissionUsage } from './generationTaskSubmitter';
import { pollTasksOnce, probeFailedTasks } from './generationTaskPolling';

vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ generationTasks: [] }) } }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), storageConfigHeaders: () => ({}) }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientOverrides: () => ({}), getGatewayClientHeaders: () => ({}), getMultimodalClientOverrides: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
});
afterEach(() => vi.unstubAllGlobals());

function task(mediaType: 'image' | 'video' | 'audio'): GenerationTask {
  return { id: 'original-operation', model: mediaType === 'video' ? 'veo3.1' : mediaType === 'audio' ? 'speech-2.8-hd' : 'gpt-image-2', mediaType,
    prompt: 'test', status: 'IN_PROGRESS', createdAt: Date.now(), videoDuration: 8, videoResolution: '720P',
    usageScope: { workspaceId: 'original-workspace', channelId: 'original-channel', mediaType } } as GenerationTask;
}

it.each(['image', 'video', 'audio'] as const)('P2 keeps %s accepted, paid failure and recovered success as one cumulative operation', async mediaType => {
  const saved = task(mediaType);
  // Acceptance alone cannot prove either billable usage or successful output.
  recordSubmissionUsage(saved, { taskId: 'provider', recordId: 'record' });
  expect(getUsageLogs()).toHaveLength(0);
  recordSubmissionUsage(saved, { taskId: 'provider', recordId: 'record', usage: { prompt_tokens: 5 } });
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, billableCount: 1, promptTokens: 5, scope: saved.usageScope });
  const cost = getUsageLogs()[0].costUsd;
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'FAILURE', taskId: 'provider', recordId: 'record', failReason: 'charged failure', usage: { completion_tokens: 7, total_tokens: 12 } }));
  await pollTasksOnce([{ ...saved, taskId: 'provider' }], vi.fn(), {}, new Set());
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, totalTokens: 12, promptTokens: 5, completionTokens: 7 });
  expect(getUsageLogs()[0].costUsd).toBeGreaterThanOrEqual(cost);
  expect(getUsageSummary('today')).toMatchObject({ imageCount: 0, videoCount: 0, totalRequests: 1, totalTokens: 12 });
  // A confirmed recovered result promotes the same ledger row even without new usage.
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', taskId: 'provider', recordId: 'record', resultUrl: '/storage/recovered' }));
  await pollTasksOnce([{ ...saved, submissionRecoveryRequired: true }], vi.fn(), {}, new Set());
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, totalTokens: 12, scope: saved.usageScope });
  // Stale pages may replay partial pending and failed receipts after success.
  for (const status of ['IN_PROGRESS', 'FAILURE']) {
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status, taskId: 'provider', recordId: 'record', usage: { total_tokens: 2 } }));
    await pollTasksOnce([{ ...saved, taskId: 'provider' }], vi.fn(), {}, new Set());
  }
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, totalTokens: 12 });
});

it.each(['image', 'video', 'audio'] as const)('P2 counts immediate successful %s results once and retains cumulative usage', mediaType => {
  const saved = task(mediaType);
  const receipt = { resultUrl: '/storage/result', taskId: 'provider', recordId: 'record', usage: { total_tokens: 9 } };
  recordSubmissionUsage(saved, receipt, true);
  recordSubmissionUsage(saved, receipt, true);
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, billableCount: 1, totalTokens: 9 });
});

it('P2 retains paid usage from a failed recheck and promotes it only after a later success', async () => {
  const saved = { ...task('image'), taskId: 'provider', dbId: 'record', status: 'FAILURE' as const };
  const recovered = new Set<string>();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'FAILURE', taskId: 'provider', recordId: 'record', usage: { total_tokens: 7 } }));
  await probeFailedTasks([saved], vi.fn(), recovered, new Set());
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, totalTokens: 7 });
  expect(recovered.size).toBe(0);
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', taskId: 'provider', recordId: 'record', resultUrl: '/storage/result' }));
  await probeFailedTasks([saved], vi.fn(), recovered, new Set());
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, totalTokens: 7 });
});

it('P2 restores a charged failed image by original key and records its receipt once with zero outputs', async () => {
  const saved = { ...task('image'), submissionRecoveryRequired: true };
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ status: 'FAILURE', taskId: 'original-provider', recordId: 'original-record', failReason: 'paid failure', usage: { totalTokens: 12 } }));
  const update = vi.fn();
  await pollTasksOnce([saved], update, {}, new Set());
  await pollTasksOnce([saved], update, {}, new Set());
  expect(vi.mocked(apiFetch).mock.calls.every(([url]) => String(url).includes('taskKey=original-operation'))).toBe(true);
  expect(update).toHaveBeenLastCalledWith(saved.id, expect.objectContaining({ status: 'FAILURE', taskId: 'original-provider', dbId: 'original-record', submissionRecoveryRequired: false }));
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ recordId: 'original-record', taskId: 'original-provider', success: false, mediaCount: 0, billableCount: 1, totalTokens: 12 });
  expect(getUsageSummary('today')).toMatchObject({ totalRequests: 1, totalTokens: 12, imageCount: 0 });
});

it.each(['image', 'video', 'audio'] as const)('P2 merges pending %s usage without reporting successful output', async mediaType => {
  const saved = { ...task(mediaType), taskId: 'provider' };
  for (const usage of [undefined, { prompt_tokens: 5 }, { completion_tokens: 7, total_tokens: 12 }]) {
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'IN_PROGRESS', taskId: 'provider', recordId: 'record', usage }));
    await pollTasksOnce([saved], vi.fn(), {}, new Set());
    if (!usage) expect(getUsageLogs()).toHaveLength(0);
  }
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: false, mediaCount: 0, billableCount: 1, promptTokens: 5, completionTokens: 7, totalTokens: 12 });
  expect(getUsageSummary('today')).toMatchObject({ totalRequests: 1, imageCount: 0, videoCount: 0 });
});

it.each(['image', 'audio'] as const)('P2 %s original operation receipts stay cleared on completion and refresh recovery', async mediaType => {
  const { clearUsageLogs } = await import('@client/shared/utils/usageTracker');
  const saved = task(mediaType);
  recordSubmissionUsage(saved, { usage: { totalTokens: 5 } });
  clearUsageLogs();
  recordSubmissionUsage(saved, { usage: { totalTokens: 8 } }, true);
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', recordId: 'record', resultUrl: '/recovered.png', usage: { totalTokens: 8 } }));
  await pollTasksOnce([{ ...saved, taskId: 'provider' }], vi.fn(), {}, new Set());
  expect(getUsageLogs()).toEqual([]);
});

it('P2 generation Agent replay keeps its pre-clear epoch and missing historical scope is not reassigned', async () => {
  const { clearUsageLogs } = await import('@client/shared/utils/usageTracker');
  const { createUsageScope } = await import('@client/shared/utils/usageScope');
  const { recordAgentTaskUsage } = await import('./recoverAgentTurn');
  const original = { usageScope: createUsageScope('chat') };
  recordAgentTaskUsage(original, 'old-turn', 'gpt-6-luna', { totalTokens: 7 });
  clearUsageLogs();
  recordAgentTaskUsage(JSON.parse(JSON.stringify(original)), 'old-turn', 'gpt-6-luna', { totalTokens: 12 });
  const legacy = task('image'); delete legacy.usageScope;
  recordSubmissionUsage(legacy, { usage: { totalTokens: 9 } }, true);
  expect(getUsageLogs()).toEqual([]);
  recordAgentTaskUsage({ usageScope: createUsageScope('chat') }, 'new-turn', 'gpt-6-luna', { totalTokens: 3 });
  expect(getUsageLogs()).toHaveLength(1); expect(getUsageLogs()[0].totalTokens).toBe(3);
});
