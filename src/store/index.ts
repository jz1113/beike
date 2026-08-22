import { create } from 'zustand';
import { createViewSlice } from './viewSlice';
import { createHubSlice } from './hubSlice';
import { createGenerateSlice } from './generateSlice';
import { createWorkshopSlice } from './workshopSlice';
import { createAssistantSlice } from './assistantSlice';
import {
  loadGenerationTombstones,
  STUDIO_DRAFT_KEY,
  getStoredWorkshopModeDraft,
  persistWorkshopModeDraftToStorage,
} from './persist';
import {
  applyWorkshopModeSession,
  extractWorkshopModeSession,
  hydrateWorkshopSessionFromDraft,
} from './workshopSession';
import type { AppState } from './types';

if (typeof window !== 'undefined') {
  loadGenerationTombstones();
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
  ...createHubSlice(...a),
  ...createGenerateSlice(...a),
  ...createWorkshopSlice(...a),
  ...createAssistantSlice(...a),
  ...buildInitialWorkshopHydration(),
}));

if (typeof window !== 'undefined') {
  useAppStore.subscribe((state, prev) => {
    const mode = state.workshopMode;
    const sessionFields = extractWorkshopModeSession(state);
    const prevFields = extractWorkshopModeSession(prev);
    if (JSON.stringify(sessionFields) === JSON.stringify(prevFields) && mode === prev.workshopMode) {
      return;
    }

    persistWorkshopModeDraftToStorage(mode, sessionFields);

    const cacheKey = mode === 'social_face_product_swap' ? 'socialSessionCache' : 'originalSessionCache';
    if (JSON.stringify(state[cacheKey]) !== JSON.stringify(sessionFields)) {
      useAppStore.setState({ [cacheKey]: sessionFields } as Partial<AppState>);
    }
  });
}

export type {
  AppState,
  ViewSlice,
  HubSlice,
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
} from './types';

export {
  sanitizeAssistantSessions,
  persistAssistantSessions,
  persistDrawingStateToStorage,
  buildSocialPromptSourceKey,
  persistStudioDraftToStorage,
  persistWorkshopModeDraftToStorage,
  clearBuyerShowStudioDraft,
} from './persist';
