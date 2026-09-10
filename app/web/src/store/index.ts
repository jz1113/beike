import { create } from 'zustand';
import { createViewSlice } from './viewSlice';
import { createHomeSlice } from './homeSlice';
import { createGenerateSlice } from './generateSlice';
import { createWorkshopSlice } from './workshopSlice';
import { createAssistantSlice } from './assistantSlice';
import { createBrandKitSlice } from './brandKitSlice';
import { createAssistantSkillSlice } from './assistantSkillSlice';
import {
  loadGenerationTombstones,
  migrateLegacyWorkshopDraftKeys,
  getStoredAssistantState,
  STUDIO_DRAFT_KEY,
  getStoredWorkshopModeDraft,
  persistWorkshopModeDraftToStorage,
} from './persist/index';
import {
  applyWorkshopModeSession,
  areWorkshopSessionsEqual,
  extractWorkshopModeSession,
  hydrateWorkshopSessionFromDraft,
} from './workshopSession';
import type { AppState } from '@/types/store';

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
    'social_face_product_swap',
    getStoredWorkshopModeDraft('social_face_product_swap'),
  );
  const originalSession = hydrateWorkshopSessionFromDraft(
    'storyboard_generate',
    getStoredWorkshopModeDraft('storyboard_generate'),
  );

  return {
    socialSessionCache: socialSession,
    originalSessionCache: originalSession,
    ...applyWorkshopModeSession(socialSession),
    workshopMode: 'social_face_product_swap',
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

    const cacheKey = mode === 'social_face_product_swap' ? 'socialSessionCache' : 'originalSessionCache';
    if (!areWorkshopSessionsEqual(state[cacheKey], sessionFields)) {
      useAppStore.setState({ [cacheKey]: sessionFields } as Partial<AppState>);
    }
  });

  const hydrateAssistant = () => {
    const { sessions, currentId } = getStoredAssistantState();
    useAppStore.setState({
      assistantSessions: sessions,
      currentAssistantSessionId: currentId,
    });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(hydrateAssistant, { timeout: 2000 });
  } else {
    setTimeout(hydrateAssistant, 0);
  }
}

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
} from '@/types/store';

export {
  sanitizeAssistantSessions,
  persistAssistantSessions,
  persistDrawingStateToStorage,
  buildSocialPromptSourceKey,
  persistStudioDraftToStorage,
  persistWorkshopModeDraftToStorage,
  clearWorkshopStudioDraft,
} from './persist/index';

if (typeof window !== 'undefined') {
  (window as any).useAppStore = useAppStore;
}

