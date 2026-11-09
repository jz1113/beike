import type { StoreApi } from 'zustand';
import type { AppState } from './types';
import {
  loadGenerationTombstones, restoreDrawingArchive,
} from './persist/index';
import { revokeSnapshotBlobUrls } from './persist/generationArchive';
import { attachDrawingPageLifecycle, finishDrawingHydration } from './persist/generation';
import { mergeAndSortTasks, mergeRestoredSessions } from './generateSliceHelpers';

function scheduleAssistant(callback: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}

const browserServices = {
  prepare: () => {
    loadGenerationTombstones();
  },
  restoreArchive: restoreDrawingArchive,
  finishHydration: finishDrawingHydration,
  attachPageLifecycle: attachDrawingPageLifecycle,
  scheduleAssistant,
  reportError: (error: unknown) => console.error('[store] 恢复未完成', error),
};

export interface AppStoreBootstrap {
  ready: Promise<void>;
  dispose: () => void;
}

type BootstrapServices = typeof browserServices;
const active = new WeakMap<StoreApi<AppState>, AppStoreBootstrap>();
const initialized = new WeakSet<StoreApi<AppState>>();

const CONVERSATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Expire chat history, leaving canvas sessions and generated assets intact. */
export function expireConversations(store: StoreApi<AppState>, now = Date.now()) {
  const state = store.getState();
  const expired = (createdAt: number) => Number.isFinite(createdAt) && createdAt > 0 && now - createdAt >= CONVERSATION_LIFETIME_MS;
  for (const session of state.sessions || []) {
    if (!session.canvasProjectId && expired(session.createdAt)) state.deleteSession(session.id);
  }
  for (const session of state.assistantSessions || []) {
    if (expired(session.createdAt)) void state.deleteAssistantSession(session.id);
  }
}

/** Called by the application entry before rendering, outside React effects.
 * Repeated starts share one subscription; dispose invalidates late results. */
export function bootstrapAppStore(store: StoreApi<AppState>, services: BootstrapServices = browserServices): AppStoreBootstrap {
  const current = active.get(store);
  if (current) return current;
  if (typeof window === 'undefined') return { ready: Promise.resolve(), dispose: () => {} };
  const controller = new AbortController();
  if (!initialized.has(store)) {
    services.prepare();
    initialized.add(store);
  }
  const detachPage = services.attachPageLifecycle();
  const cancelAssistant = services.scheduleAssistant(() => {
    if (!controller.signal.aborted) void store.getState().hydrateAssistantSessions(controller.signal).then(() => {
      if (!controller.signal.aborted && store.getState().generationHistoryReady) expireConversations(store);
    }).catch(services.reportError);
  });
  const ready = Promise.resolve().then(() => services.restoreArchive()).then(restored => {
    if (controller.signal.aborted) {
      revokeSnapshotBlobUrls(restored);
      return;
    }
    const state = store.getState();
    store.setState({
      ...(restored ? {
        sessions: mergeRestoredSessions(state.sessions, restored.sessions),
        currentSessionId: restored.sessions.some(session => session.id === restored.currentId && !session.canvasProjectId)
          ? restored.currentId : restored.sessions.find(session => !session.canvasProjectId)?.id || 'session-default',
        generationTasks: mergeAndSortTasks(state.generationTasks, restored.tasks),
      } : {}),
      generationHistoryReady: true,
    });
    services.finishHydration();
    expireConversations(store);
  }).catch(error => {
    if (controller.signal.aborted) return;
    services.reportError(error);
    store.setState({ generationHistoryReady: true });
    services.finishHydration();
  });
  const expiryTimer = setInterval(() => {
    if (store.getState().generationHistoryReady) expireConversations(store);
  }, 60_000);
  const handle: AppStoreBootstrap = { ready, dispose: () => {
    if (controller.signal.aborted) return;
    controller.abort();
    detachPage();
    cancelAssistant();
    clearInterval(expiryTimer);
    active.delete(store);
  } };
  active.set(store, handle);
  return handle;
}
