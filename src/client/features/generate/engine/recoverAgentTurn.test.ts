import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), tasks: [] as GenerationTask[] }));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ generationTasks: mocks.tasks }) } }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
import {
  generationSubmissionQueue,
  getGenerationMediaConcurrency,
  readAgentTurnSnapshot,
  recoverAgentTurn,
  restoreAgentTurnItems,
  restoreStoredAgentTask,
  setGenerationMediaConcurrency,
  subscribeGenerationMediaConcurrency,
} from './recoverAgentTurn';

const fetch = mocks.fetch;
const snapshot = { id: 'turn', threadId: 'thread', status: 'running' as const, items: [] };
const initialConcurrency = getGenerationMediaConcurrency();
const storedTask: GenerationTask = { id: 'agent-task', sessionId: 'chat', taskId: 'turn', mediaType: 'agent', title: '对话', prompt: '问题', model: 'gpt-6-luna', size: '-', quality: 'high', status: 'IN_PROGRESS', progress: '15%', useReferenceImage: false, submissionRecoveryRequired: true, agentTurn: { turnId: 'turn', threadId: 'chat' } };

beforeEach(() => { mocks.tasks = [{ ...storedTask }]; vi.clearAllMocks(); });
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  generationSubmissionQueue.cancel();
  setGenerationMediaConcurrency(initialConcurrency);
});

describe('Agent turn delivery recovery', () => {
  it('polls the same turn until it completes and never makes another POST', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: { ...snapshot, status: 'completed' } }) });
    const update = vi.fn();
    const pending = recoverAgentTurn('turn', 'thread', new AbortController().signal, update);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending)?.status).toBe('completed');
    expect(update).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url, init]) => url === '/api/assistant/turns/turn/snapshot' && !init.method)).toBe(true);
  });
  it('does not accept a snapshot belonging to another turn or thread', () => {
    expect(readAgentTurnSnapshot({ ...snapshot, id: 'other' }, 'turn', 'thread')).toBeNull();
    expect(readAgentTurnSnapshot({ ...snapshot, threadId: 'other' }, 'turn', 'thread')).toBeNull();
  });
  it('stops promptly when the user cancels while waiting to recover', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, snapshot }) });
    const pending = recoverAgentTurn('turn', 'thread', controller.signal, vi.fn());
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds unavailable-server recovery and preserves current text against stale snapshots', async () => {
    vi.useFakeTimers();
    fetch.mockRejectedValue(new TypeError('network error'));
    const pending = recoverAgentTurn('turn', 'thread', new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    const current: AssistantItem[] = [{ id: 'reply', kind: 'agentMessage', content: '较完整的已接收内容', createdAt: 1 }];
    expect(restoreAgentTurnItems(current, { ...snapshot, items: [{ ...current[0], content: '较完整' } as AssistantItem] })).toEqual(current);
  });
});

describe('restoreStoredAgentTask', () => {
  it('recovers the accepted reply through GET only and does not replay a generation action', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, snapshot: { id: 'turn', threadId: 'chat', status: 'completed', items: [{ id: 'answer', kind: 'agentMessage', content: '原任务的完整回答', createdAt: 1 }] } }) });
    const update = vi.fn();
    expect(await restoreStoredAgentTask(storedTask, update, new AbortController().signal)).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/assistant/turns/turn/snapshot');
    expect(mocks.fetch.mock.calls[0][1].method).toBeUndefined();
    expect(update).toHaveBeenCalledWith(storedTask.id, expect.objectContaining({ status: 'SUCCESS', submissionRecoveryRequired: false, agentTurn: expect.objectContaining({ reply: '原任务的完整回答' }) }));
  });
  it('does not overwrite a task explicitly stopped while its snapshot was in flight', async () => {
    mocks.fetch.mockImplementation(async () => { mocks.tasks = [{ ...storedTask, status: 'FAILURE', submissionRecoveryRequired: false }]; return { ok: true, json: async () => ({ success: true, snapshot: { id: 'turn', threadId: 'chat', status: 'completed', items: [] } }) }; });
    const update = vi.fn();
    await restoreStoredAgentTask(storedTask, update, new AbortController().signal);
    expect(update).not.toHaveBeenCalled();
  });
  it('leaves unavailable receipts pending for another GET attempt', async () => {
    vi.useFakeTimers(); mocks.fetch.mockRejectedValue(new Error('offline'));
    const update = vi.fn();
    const pending = restoreStoredAgentTask(storedTask, update, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.every(([, init]) => !init.method)).toBe(true);
  });
  it('keeps locally received text until the restored snapshot catches up', async () => {
    vi.useFakeTimers(); mocks.tasks = [{ ...storedTask, agentTurn: { ...storedTask.agentTurn, reply: '已收到的部分回答' } }];
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: { id: 'turn', threadId: 'chat', status: 'running', items: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: { id: 'turn', threadId: 'chat', status: 'completed', items: [{ id: 'reply', kind: 'agentMessage', content: '完整回答', createdAt: 1 }] } }) });
    const update = vi.fn(); const pending = restoreStoredAgentTask(storedTask, update, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2000); await pending;
    expect(update.mock.calls[0][1].agentTurn.reply).toBe('已收到的部分回答');
    expect(update.mock.calls[1][1].agentTurn.reply).toBe('完整回答');
  });
});

describe('generation submission configuration', () => {
  it('configures the same shared queue used by the generation engine', () => {
    expect(getGenerationMediaConcurrency()).toBe(GENERATION_BATCH_LIMIT);
    expect(setGenerationMediaConcurrency(6)).toBe(6);
    expect(generationSubmissionQueue.getMediaConcurrency()).toBe(6);
    expect(setGenerationMediaConcurrency(1)).toBe(1);
    expect(getGenerationMediaConcurrency()).toBe(1);
  });

  it('notifies subscribers only when the effective concurrency changes and supports unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGenerationMediaConcurrency(listener);
    try {
      setGenerationMediaConcurrency(5);
      expect(listener).toHaveBeenCalledOnce();
      setGenerationMediaConcurrency(5.9);
      expect(listener).toHaveBeenCalledOnce();
      setGenerationMediaConcurrency(99);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(getGenerationMediaConcurrency()).toBe(GENERATION_BATCH_LIMIT);
      unsubscribe();
      setGenerationMediaConcurrency(2);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});

it('restores a direct collection product card from the saved turn', () => {
  const productWidget = { itemId: '10231557417974', platform: 'jd', title: '商品', mainImages: ['https://example.com/a.jpg'], detailImages: [], skuImages: [], allImages: ['https://example.com/a.jpg'] };
  expect(readAgentTurnSnapshot({ ...snapshot, status: 'completed', modelUsed: 'direct-collection', productWidget }, 'turn', 'thread')?.productWidget).toEqual(productWidget);
  expect(readAgentTurnSnapshot({ ...snapshot, productWidget: { title: 'incomplete' } }, 'turn', 'thread')?.productWidget).toBeUndefined();
});
