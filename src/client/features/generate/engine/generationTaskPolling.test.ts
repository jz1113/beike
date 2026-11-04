import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { failedTaskPollEndpoint, pollTasksOnce, probeFailedTasks } from './generationTaskPolling';

vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ generationTasks: [] }) } }));
vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), storageConfigHeaders: () => ({ 'x-storage': 'configured' }),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientOverrides: () => ({ customBaseUrl: 'https://global.example' }),
  getGatewayClientHeaders: vi.fn(() => ({ 'x-custom-base-url': 'https://chosen.example', 'x-custom-api-key': 'chosen-key' })),
}));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordMediaTaskUsage: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({
    success: true, status: 'SUCCESS', resultUrl: '/storage/result.mp4',
  })));
});

function task(partial: Partial<GenerationTask>): GenerationTask {
  return {
    id: 't1',
    prompt: '',
    model: 'gpt-image-2',
    status: 'FAILURE',
    createdAt: 1,
    ...partial,
  } as GenerationTask;
}

describe('failedTaskPollEndpoint', () => {
  it('routes depth images away from the generic image poller', () => {
    expect(failedTaskPollEndpoint(task({ mediaType: 'depth-image' }))).toBe('/api/generate/depth-image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'image' }))).toBe('/api/generate/image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'audio' }))).toBe('/api/generate/audio');
  });
});

describe('generation receipt query routing', () => {
  it.each(['image', 'video'] as const)('keeps the selected channel and upstream model for %s polling', async mediaType => {
    const saved = task({ mediaType, model: 'upstream-model', modelRouteKey: 'chosen-route', taskId: 'upstream/task', status: 'IN_PROGRESS' });
    const update = vi.fn();
    await pollTasksOnce([saved], update, {}, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.pathname).toBe(`/api/generate/${mediaType}`);
    expect(url.searchParams.get('taskId')).toBe('upstream/task');
    expect(url.searchParams.get('model')).toBe('upstream-model');
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('chosen-route');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example', 'x-custom-api-key': 'chosen-key' });
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'SUCCESS', resultUrl: '/storage/result.mp4' }));
  });

  it('keeps the selected channel when recovering a disconnected submission', async () => {
    const saved = task({ mediaType: 'video', model: 'upstream-model', modelRouteKey: 'chosen-route', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    await pollTasksOnce([saved], vi.fn(), {}, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(new URL(String(input), 'http://localhost').searchParams.get('taskKey')).toBe('t1');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example' });
  });

  it('links an uncertain receipt with an upstream ID instead of treating it as a missing submission', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      success: false, status: 'QUERY_FAILED', submissionUnknown: true,
      taskId: 'accepted-original', recordId: 'saved-receipt', model: 'upstream-model',
    })));
    const saved = task({ mediaType: 'video', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    const update = vi.fn();
    await pollTasksOnce([saved], update, { t1: 5 }, new Set());
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({
      taskId: 'accepted-original', dbId: 'saved-receipt', submissionRecoveryRequired: false,
    }));
    expect(update.mock.calls.some(([, patch]) => patch.status === 'FAILURE')).toBe(false);
  });

  it('asks the backend to recheck the failed receipt without resubmitting generation', async () => {
    const saved = task({ mediaType: 'video', model: 'upstream-model', modelRouteKey: 'chosen-route', taskId: 'original/task' });
    const update = vi.fn();
    const recovered = new Set<string>();
    await probeFailedTasks([saved], update, recovered, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.searchParams.get('model')).toBe('upstream-model');
    expect(url.searchParams.get('recheck_failed')).toBe('1');
    expect(init?.method).not.toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example' });
    expect(recovered.has('t1')).toBe(true);
  });
});
