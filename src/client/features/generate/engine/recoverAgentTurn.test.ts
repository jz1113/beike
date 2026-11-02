import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantItem } from '@shared/domain/assistant/types';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));
import { readAgentTurnSnapshot, recoverAgentTurn, restoreAgentTurnItems } from './recoverAgentTurn';

const snapshot = { id: 'turn', threadId: 'thread', status: 'running' as const, items: [] };
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

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
