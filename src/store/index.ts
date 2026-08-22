import { create } from 'zustand';
import { createViewSlice } from './viewSlice';
import { createHubSlice } from './hubSlice';
import { createGenerateSlice } from './generateSlice';
import { createWorkshopSlice } from './workshopSlice';
import { createAssistantSlice } from './assistantSlice';
import { loadGenerationTombstones, STUDIO_DRAFT_KEY } from './persist';
import type { AppState } from './types';

// 种草工坊不自动恢复上次草稿：每次进入从空白开始，避免旧图/旧词/失效横幅拖累操作
if (typeof window !== 'undefined') {
  loadGenerationTombstones();
  try {
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
  } catch {}
}

export const useAppStore = create<AppState>()((...a) => ({
  ...createViewSlice(...a),
  ...createHubSlice(...a),
  ...createGenerateSlice(...a),
  ...createWorkshopSlice(...a),
  ...createAssistantSlice(...a),
}));

export type {
  AppState,
  ViewSlice,
  HubSlice,
  GenerateSlice,
  WorkshopSlice,
  AssistantSlice,
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
