import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createAssistantSlice } from './assistantSlice';
import type { AppState } from './types';

const remote = vi.hoisted(() => ({ fetch: vi.fn(), write: vi.fn() }));
vi.mock('@client/shared/api/assistantSessions', () => ({ fetchAssistantSessionsRemote: remote.fetch, deleteAssistantSessionRemote: vi.fn() }));
vi.mock('./persist/index', () => ({
  assistantDeletedIds: new Set(), clearAssistantPersistTimer: vi.fn(), getStoredAssistantState: () => ({ sessions: [], currentId: 'default' }),
  loadAssistantTombstones: vi.fn(), markAssistantSessionDeleted: vi.fn(), persistAssistantSessions: vi.fn(), writeAssistantLocalCache: remote.write,
}));

describe('assistant recovery lifecycle', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
  it('does not publish or persist late remote sessions after bootstrap disposal', async () => {
    vi.stubGlobal('window', {});
    let resolve!: (value: unknown[]) => void;
    remote.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const store = createStore<AppState>()((set, get, api) => ({ ...createAssistantSlice(set, get, api) } as AppState));
    const controller = new AbortController();
    const pending = store.getState().hydrateAssistantSessions(controller.signal);
    controller.abort();
    remote.fetch.mockResolvedValueOnce([{ id: 'fresh', title: 'fresh', messages: [], createdAt: 1, updatedAt: 1 }]);
    const next = store.getState().hydrateAssistantSessions();
    resolve([{ id: 'late', title: 'late', messages: [], createdAt: 1, updatedAt: 1 }]);
    await pending;
    expect(store.getState().assistantSessions).toEqual([]);
    expect(remote.write).not.toHaveBeenCalled();
    await next;
    expect(store.getState().assistantSessions.map(session => session.id)).toEqual(['fresh']);
    expect(remote.write).toHaveBeenCalledTimes(1);
  });
});
