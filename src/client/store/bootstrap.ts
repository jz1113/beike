import type { StoreApi } from 'zustand';
import type { AppState } from './types';
import { finishDrawingHydration } from './persist/generationHydration';
import {
  loadGenerationTombstones, migrateLegacyWorkshopDraftKeys, STUDIO_DRAFT_KEY,
  getStoredWorkshopModeDraft, persistWorkshopModeDraftToStorage, restoreDrawingArchive,
} from './persist/index';
import { attachDrawingPageLifecycle } from './persist/generation';
import {
  applyWorkshopModeSession, areWorkshopSessionsEqual, extractWorkshopModeSession,
  hydrateWorkshopSessionFromDraft,
} from './workshopSession';
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
    migrateLegacyWorkshopDraftKeys();
    try { sessionStorage.removeItem(STUDIO_DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
  },
  readDraft: () => getStoredWorkshopModeDraft('storyboard_generate'),
  persistDraft: persistWorkshopModeDraftToStorage,
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

/** Called by the application entry before rendering, outside React effects.
 * Repeated starts share one subscription; dispose invalidates late results. */
export function bootstrapAppStore(store: StoreApi<AppState>, services: BootstrapServices = browserServices): AppStoreBootstrap {
  const current = active.get(store);
  if (current) return current;
  if (typeof window === 'undefined') return { ready: Promise.resolve(), dispose: () => {} };
  const controller = new AbortController();
  if (!initialized.has(store)) {
    services.prepare();
    const draft = services.readDraft();
    const social = hydrateWorkshopSessionFromDraft('storyboard_generate', draft);
    const original = hydrateWorkshopSessionFromDraft('storyboard_generate', draft);
    store.setState({ socialSessionCache: social, originalSessionCache: original, ...applyWorkshopModeSession(social), workshopMode: 'storyboard_generate' });
    initialized.add(store);
  }
  const unsubscribe = store.subscribe((state, prev) => {
    const fields = extractWorkshopModeSession(state);
    if (state.workshopMode === prev.workshopMode && areWorkshopSessionsEqual(fields, extractWorkshopModeSession(prev))) return;
    services.persistDraft(state.workshopMode, fields);
    if (!areWorkshopSessionsEqual(state.originalSessionCache, fields)) store.setState({ originalSessionCache: fields });
  });
  const detachPage = services.attachPageLifecycle();
  const cancelAssistant = services.scheduleAssistant(() => {
    if (!controller.signal.aborted) void store.getState().hydrateAssistantSessions(controller.signal).catch(services.reportError);
  });
  const ready = Promise.resolve().then(() => services.restoreArchive()).then(restored => {
    if (controller.signal.aborted) return;
    const state = store.getState();
    store.setState({
      ...(restored ? {
        sessions: mergeRestoredSessions(state.sessions, restored.sessions),
        currentSessionId: restored.currentId,
        generationTasks: mergeAndSortTasks(state.generationTasks, restored.tasks),
      } : {}),
      generationHistoryReady: true,
    });
    services.finishHydration();
  }).catch(error => {
    if (controller.signal.aborted) return;
    services.reportError(error);
    store.setState({ generationHistoryReady: true });
    services.finishHydration();
  });
  const handle: AppStoreBootstrap = { ready, dispose: () => {
    if (controller.signal.aborted) return;
    controller.abort();
    unsubscribe();
    detachPage();
    cancelAssistant();
    active.delete(store);
  } };
  active.set(store, handle);
  return handle;
}
