import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { agentHistorySnapshot, isAgentConversation } from './agentHistory';
import type { ChatSession, GenerationTask } from './appStoreTypes';
import { createAssistantSlice } from './assistantSlice';
import { bootstrapAppStore, expireConversations } from './bootstrap';
import { createWorkshopSlice } from './index';
import type { AppState } from './types';

const remote = vi.hoisted(() => ({ fetch: vi.fn(), write: vi.fn() }));
vi.mock('./persist/index', async (importOriginal) => ({
  ...await importOriginal<typeof import('./persist/index')>(),
  assistantDeletedIds: new Set(), clearAssistantPersistTimer: vi.fn(), getStoredAssistantState: () => ({ sessions: [], currentId: 'default' }),
  loadAssistantTombstones: vi.fn(), markAssistantSessionDeleted: vi.fn(), persistAssistantSessions: vi.fn(), writeAssistantLocalCache: remote.write,
  fetchAssistantSessionsRemote: remote.fetch, deleteAssistantSessionRemote: vi.fn(),
}));

function fixture() {
  vi.stubGlobal('window', {});
  const store = createStore<AppState>(() => ({
    sessions: [], generationTasks: [], currentSessionId: 'session-default', generationHistoryReady: false, hydrateAssistantSessions: vi.fn().mockResolvedValue(undefined),
  } as unknown as AppState));
  const detach = vi.fn(), cancel = vi.fn();
  const services = {
    prepare: vi.fn(),
    restoreArchive: vi.fn(async () => null as { sessions: ChatSession[]; currentId: string; tasks: GenerationTask[] } | null),
    finishHydration: vi.fn(), attachPageLifecycle: vi.fn(() => detach), scheduleAssistant: vi.fn((callback: () => void) => { void callback; return cancel; }), reportError: vi.fn(),
  };
  return { store, services, detach, cancel };
}

describe('explicit application store bootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([true, false])('restores canvas history without selecting it as an ordinary conversation: %s', hasChat => {
    const { store, services } = fixture();
    const canvas: ChatSession = { id: 'canvas-session:project-a', canvasProjectId: 'project-a', title: '画布', createdAt: 2, tasks: [] };
    const chat: ChatSession = { id: 'chat', title: '普通对话', createdAt: 1, tasks: [] };
    services.restoreArchive.mockResolvedValue({ sessions: hasChat ? [canvas, chat] : [canvas], currentId: canvas.id, tasks: [] });
    const handle = bootstrapAppStore(store, services);
    return handle.ready.then(() => {
      expect(store.getState().sessions.find(session => session.id === canvas.id)?.canvasProjectId).toBe('project-a');
      expect(store.getState().currentSessionId).toBe(hasChat ? chat.id : 'session-default');
      handle.dispose();
    });
  });

  it('prepares once, starts one lifecycle subscription and releases it', async () => {
    const { store, services, detach, cancel } = fixture();
    const handle = bootstrapAppStore(store, services);
    expect(bootstrapAppStore(store, services)).toBe(handle);
    await handle.ready;
    handle.dispose(); handle.dispose();
    expect(detach).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
    const restarted = bootstrapAppStore(store, services);
    await restarted.ready;
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

const task = (id: string, mediaType = 'image') => ({ id, mediaType, prompt: id, status: 'SUCCESS', createdAt: 1 } as GenerationTask);
const session = (id: string, tasks: GenerationTask[], canvasProjectId?: string): ChatSession => ({ id, tasks, canvasProjectId, title: id, createdAt: 1 });

describe('Agent conversation history', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('excludes ordinary generations, empty drafts and canvas projects', () => {
    expect(isAgentConversation(session('image', [task('image')]))).toBe(false);
    expect(isAgentConversation(session('draft', []))).toBe(false);
    expect(isAgentConversation(session('canvas', [task('agent-task-canvas', 'agent')], 'canvas'))).toBe(false);
    expect(isAgentConversation(session('agent', [task('agent', 'agent')]))).toBe(true);
    expect(isAgentConversation(session('legacy', [task('agent-task-legacy')]))).toBe(true);
  });

  it('retains all generated media while persisting only Agent conversations', () => {
    const image = task('image');
    const canvas = task('canvas');
    const agent = task('agent', 'agent');
    const snapshot = { tasks: [image], sessions: [session('ordinary', [image]), session('canvas', [canvas], 'project'), session('agent', [agent])], currentId: 'ordinary', updatedAt: 1 };
    const saved = agentHistorySnapshot(snapshot);
    expect(saved.sessions.map(item => item.id)).toEqual(['agent']);
    expect(saved.tasks.map(item => item.id)).toEqual(['image', 'canvas', 'agent']);
    expect(snapshot.sessions).toHaveLength(3);
    expect(agentHistorySnapshot(saved)).toEqual(saved);
  });

  it('writes only Agent conversations to the actual local cache without losing generation records', async () => {
    const cache = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
      removeItem: (key: string) => cache.delete(key),
    });
    const { persistDrawingStateToStorage } = await import('./persist/generation');
    const ordinary = task('ordinary');
    const agent = task('agent-task-saved', 'agent');
    persistDrawingStateToStorage([ordinary, agent], [session('ordinary', [ordinary]), session('agent', [agent])], 'agent', { force: true, immediate: true });
    const saved = JSON.parse(cache.get('drawing_history_v2')!);
    expect(saved.sessions.map((item: ChatSession) => item.id)).toEqual(['agent']);
    expect(saved.tasks.map((item: GenerationTask) => item.id)).toEqual(['ordinary', 'agent-task-saved']);
  });
});

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
    expect(store.getState().assistantSessions.map(s => s.id)).toEqual(['fresh']);
    expect(remote.write).toHaveBeenCalledTimes(1);
  });
});

const makeWorkshopStore = () => createStore<AppState>()((set, get, api) => ({ ...createWorkshopSlice(set, get, api) }) as AppState);

describe('workshop collected product import', () => {
  it('keeps SKU-only imports out of the main category', () => {
    const store = makeWorkshopStore();
    const sku = 'https://cdn.example.com/sku.jpg';
    store.getState().setProductData(null, { main: [], skus: [sku], details: [sku] });
    expect(store.getState().images).toEqual([{ url: sku, type: 'sku', selected: false }]);
  });

  it('deduplicates normalized CDN variants across categories', () => {
    const store = makeWorkshopStore();
    store.getState().setProductData(null, {
      main: ['https://img14.360buyimg.com/n5/s50x50_jfs/t1/a.jpg'],
      skus: ['https://img13.360buyimg.com/n1/jfs/t1/a.jpg'], details: ['jfs/t1/a.jpg'],
    });
    expect(store.getState().images).toEqual([{ url: 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.jpg', type: 'main', selected: false }]);
  });
});


it('expires conversations from creation while preserving canvas sessions', () => {
  const now = 200_000_000;
  const deleteSession = vi.fn();
  const deleteAssistantSession = vi.fn();
  const store = createStore<AppState>(() => ({
    sessions: [
      { id: 'old', createdAt: now - 86_400_000 },
      { id: 'recent', createdAt: now - 86_399_999 },
      { id: 'canvas', createdAt: now - 86_400_000, canvasProjectId: 'project' },
    ],
    assistantSessions: [{ id: 'assistant-old', createdAt: now - 86_400_000 }, { id: 'assistant-recent', createdAt: now - 1 }],
    deleteSession, deleteAssistantSession,
  } as unknown as AppState));
  expireConversations(store, now);
  expect(deleteSession).toHaveBeenCalledOnce();
  expect(deleteSession).toHaveBeenCalledWith('old');
  expect(deleteAssistantSession).toHaveBeenCalledOnce();
  expect(deleteAssistantSession).toHaveBeenCalledWith('assistant-old');
});
