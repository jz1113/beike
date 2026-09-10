/**
 * Backward-compatible entry: prefer `@/store` or `@/store/useAppStore`.
 * Implementation lives in ./index and slice modules.
 */
export { useAppStore } from './index';
export type { AppView } from './view';
export { normalizeAppView } from './view';

export type {
  AppState,
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
  clearWorkshopStudioDraft,
} from './persist/index';
