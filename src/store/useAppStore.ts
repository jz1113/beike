/**
 * Backward-compatible entry: prefer `@/store` or `@/store/useAppStore`.
 * Implementation lives in ./index and slice modules.
 */
export { useAppStore } from './index';

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
} from './types';

export {
  sanitizeAssistantSessions,
  persistAssistantSessions,
  persistDrawingStateToStorage,
  buildSocialPromptSourceKey,
  persistStudioDraftToStorage,
  clearBuyerShowStudioDraft,
} from './persist';
