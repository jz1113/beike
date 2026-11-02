import { create } from 'zustand';
import { createViewSlice } from './viewSlice';
import { createHomeSlice } from './homeSlice';
import { createGenerateSlice } from './generateSlice';
import { createWorkshopSlice } from './workshopSlice';
import { createAssistantSlice } from './assistantSlice';
import { createBrandKitSlice } from './brandKitSlice';
import { createAssistantSkillSlice } from './assistantSkillSlice';
import type { AppState } from '@client/store/types';

export const useAppStore = create<AppState>()((...a) => ({
  ...createViewSlice(...a),
  ...createHomeSlice(...a),
  ...createGenerateSlice(...a),
  ...createWorkshopSlice(...a),
  ...createAssistantSlice(...a),
  ...createBrandKitSlice(...a),
  ...createAssistantSkillSlice(...a),
}));

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
