import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { bootstrapAppStore } from './bootstrap';
import { createDefaultWorkshopSession } from './workshopSession';
import type { AppState } from './types';
import type { ChatSession, GenerationTask } from './appStoreTypes';

function fixture() {
  vi.stubGlobal('window', {});
  const session = createDefaultWorkshopSession('storyboard_generate');
  const store = createStore<AppState>(() => ({ ...session, workshopMode: 'storyboard_generate', socialSessionCache: session, originalSessionCache: session,
    sessions: [], generationTasks: [], currentSessionId: 'session-default', generationHistoryReady: false, hydrateAssistantSessions: vi.fn().mockResolvedValue(undefined),
  } as unknown as AppState));
  const detach = vi.fn(), cancel = vi.fn();
  const services = {
    prepare: vi.fn(), readDraft: vi.fn(() => ({ shotCount: 7, masterScene: '历史场景' })), persistDraft: vi.fn(),
    restoreArchive: vi.fn(async () => null as { sessions: ChatSession[]; currentId: string; tasks: GenerationTask[] } | null),
    finishHydration: vi.fn(), attachPageLifecycle: vi.fn(() => detach), scheduleAssistant: vi.fn((callback: () => void) => { void callback; return cancel; }), reportError: vi.fn(),
  };
  return { store, services, detach, cancel };
}

describe('explicit application store bootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores legacy draft once, starts one subscription and releases it', async () => {
    const { store, services, detach, cancel } = fixture();
    const handle = bootstrapAppStore(store, services);
    expect(bootstrapAppStore(store, services)).toBe(handle);
    expect(store.getState().shotCount).toBe(7);
    expect(store.getState().masterScene).toBe('历史场景');
    await handle.ready;
    store.setState({ shotCount: 8 });
    expect(services.persistDraft).toHaveBeenCalledTimes(1);
    expect(store.getState().originalSessionCache.shotCount).toBe(8);
    handle.dispose(); handle.dispose();
    store.setState({ shotCount: 9 });
    expect(services.persistDraft).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
    const restarted = bootstrapAppStore(store, services);
    await restarted.ready;
    expect(store.getState().shotCount).toBe(9);
    expect(services.prepare).toHaveBeenCalledTimes(1);
    restarted.dispose();
  });

  it('ignores a late archive after disposal and allows a fresh startup', async () => {
    const { store, services } = fixture();
    let resolve!: (value: null) => void;
    services.restoreArchive.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const old = bootstrapAppStore(store, services);
    await Promise.resolve();
    old.dispose();
    const current = bootstrapAppStore(store, services);
    await current.ready;
    resolve(null); await old.ready;
    expect(services.finishHydration).toHaveBeenCalledTimes(1);
    expect(store.getState().generationHistoryReady).toBe(true);
    current.dispose();
  });

  it('merges tasks created during archive restoration and never replays submission', async () => {
    const { store, services } = fixture();
    const existing = { id: 'new', title: 'new', prompt: 'test', model: 'test', size: '1024x1024', quality: 'high', status: 'IN_PROGRESS', useReferenceImage: false, progress: '0%', createdAt: 2 } as GenerationTask;
    const recovered = { id: 'old', status: 'SUCCESS', createdAt: 1, resultUrl: 'https://cdn.test/old.png' } as GenerationTask;
    let resolve!: (value: { sessions: ChatSession[]; currentId: string; tasks: GenerationTask[] }) => void;
    services.restoreArchive.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const handle = bootstrapAppStore(store, services);
    await Promise.resolve();
    store.setState({ generationTasks: [existing] });
    resolve({ sessions: [], currentId: 'session-default', tasks: [recovered] });
    await handle.ready;
    expect(store.getState().generationTasks.map(task => task.id)).toEqual(['new', 'old']);
    expect(services.reportError).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('makes archive failures visible and releases deferred mutations', async () => {
    const { store, services } = fixture();
    services.restoreArchive.mockRejectedValueOnce(new Error('archive unavailable'));
    const handle = bootstrapAppStore(store, services);
    await handle.ready;
    expect(services.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'archive unavailable' }));
    expect(store.getState().generationHistoryReady).toBe(true);
    expect(services.finishHydration).toHaveBeenCalledTimes(1);
    handle.dispose();
  });
});
