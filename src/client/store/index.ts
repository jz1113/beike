import { create } from 'zustand';
import { createViewSlice } from './viewSlice';
import { createHomeSlice } from './homeSlice';
import { createGenerateSlice } from './generateSlice';
import { createWorkshopSlice } from './workshopSlice';
import { createAssistantSlice } from './assistantSlice';
import { createBrandKitSlice } from './brandKitSlice';
import { createAssistantSkillSlice } from './assistantSkillSlice';
import { finishDrawingHydration } from './persist/generationHydration';
import {
  loadGenerationTombstones,
  migrateLegacyWorkshopDraftKeys,
  STUDIO_DRAFT_KEY,
  getStoredWorkshopModeDraft,
  persistWorkshopModeDraftToStorage,
  restoreDrawingArchive,
} from './persist/index';
import {
  applyWorkshopModeSession,
  areWorkshopSessionsEqual,
  extractWorkshopModeSession,
  hydrateWorkshopSessionFromDraft,
} from './workshopSession';
import type { AppState } from '@client/store/types';

if (typeof window !== 'undefined') {
  loadGenerationTombstones();
  migrateLegacyWorkshopDraftKeys();
  try {
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
  } catch {}
}

function buildInitialWorkshopHydration(): Partial<AppState> {
  if (typeof window === 'undefined') return {};

  const socialSession = hydrateWorkshopSessionFromDraft(
    'storyboard_generate',
    getStoredWorkshopModeDraft('storyboard_generate'),
  );
  const originalSession = hydrateWorkshopSessionFromDraft(
    'storyboard_generate',
    getStoredWorkshopModeDraft('storyboard_generate'),
  );

  return {
    socialSessionCache: socialSession,
    originalSessionCache: originalSession,
    ...applyWorkshopModeSession(socialSession),
    workshopMode: 'storyboard_generate',
  };
}

export const useAppStore = create<AppState>()((...a) => ({
  ...createViewSlice(...a),
  ...createHomeSlice(...a),
  ...createGenerateSlice(...a),
  ...createWorkshopSlice(...a),
  ...createAssistantSlice(...a),
  ...createBrandKitSlice(...a),
  ...createAssistantSkillSlice(...a),
  ...buildInitialWorkshopHydration(),
}));

if (typeof window !== 'undefined') {
  void restoreDrawingArchive().then(restored => {
    useAppStore.setState({
      ...(restored ? { sessions: restored.sessions, currentSessionId: restored.currentId, generationTasks: restored.tasks } : {}),
      generationHistoryReady: true,
    });
    finishDrawingHydration();
  });
  useAppStore.subscribe((state, prev) => {
    const mode = state.workshopMode;
    const sessionFields = extractWorkshopModeSession(state);

    if (mode === prev.workshopMode) {
      const prevFields = extractWorkshopModeSession(prev);
      if (areWorkshopSessionsEqual(sessionFields, prevFields)) {
        return;
      }
    }

    persistWorkshopModeDraftToStorage(mode, sessionFields);

    const cacheKey = 'originalSessionCache';
    if (!areWorkshopSessionsEqual(state[cacheKey], sessionFields)) {
      useAppStore.setState({ [cacheKey]: sessionFields } as Partial<AppState>);
    }
  });

  const hydrateAssistant = () => { void useAppStore.getState().hydrateAssistantSessions(); };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(hydrateAssistant, { timeout: 2000 });
  } else {
    setTimeout(hydrateAssistant, 0);
  }
}

export type { AppView } from './appView';
export { normalizeAppView, isAppView } from './appView';

export type {
  AppState,
  ViewSlice,
  HomeSlice,
  GenerateSlice,
  WorkshopSlice,
  AssistantSlice,
  WorkshopMode,
  WorkshopModeSession,
  ProductImage,
  ProductData,
  GenerationTask,
  ChatSession,
  MediaAttachment,
  ProductWidgetData,
  AssistantMessage,
  AssistantSession,
} from '@client/store/types';

export {
  sanitizeAssistantSessions,
  persistAssistantSessions,
  persistDrawingStateToStorage,
  buildSocialPromptSourceKey,
  persistStudioDraftToStorage,
  persistWorkshopModeDraftToStorage,
  clearWorkshopStudioDraft,
} from './persist/index';

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as { useAppStore?: typeof useAppStore }).useAppStore = useAppStore;
}
