import { create, type StateCreator } from 'zustand';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import { normalizeCollectedProductImages } from '@shared/domain/collection/productImages';
import {
  getStoredMultimodalModelId,
  setStoredMultimodalModelId,
} from '@shared/domain/models/workflowModels';
import { normalizeAppView, isAppView, requestEcommerceCanvas } from './appView';
import { createHomeSlice } from './homeSlice';
import { createGenerateSlice } from './generateSlice';
import { createAssistantSlice } from './assistantSlice';
import { createBrandKitSlice } from './brandKitSlice';
import { createAssistantSkillSlice } from './assistantSkillSlice';
import type { AppState, ProductImage, ViewSlice, WorkshopSlice } from '@client/store/types';

const WORKSHOP_SELECTED_ARCH_KEY = 'workshop_selected_arch_id';
const LEGACY_STYLE_IDS = new Set([
  'computer_office_monitor',
  'arch_atomic_asset_hub',
  'arch_jewelry_master',
  'cmu25767x000011tybm2u7c3t',
  'recipe_phone_comms_master',
  'recipe_jewelry_master',
]);

function readInitialSelectedArchId(): string {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = localStorage.getItem(WORKSHOP_SELECTED_ARCH_KEY);
    if (stored && stored.trim() && !LEGACY_STYLE_IDS.has(stored)) return stored;
  } catch {}
  return 'auto';
}

function persistSelectedArchId(archId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSHOP_SELECTED_ARCH_KEY, archId);
  } catch {}
}

export const createWorkshopSlice: StateCreator<AppState, [], [], WorkshopSlice> = (set, get) => ({
  product: null,
  images: [],
  apiUsed: null,
  selectedVisionModel: typeof window !== 'undefined'
    ? getStoredMultimodalModelId(DEFAULT_MULTIMODAL_MODEL_ID)
    : DEFAULT_MULTIMODAL_MODEL_ID,
  selectedArchId: readInitialSelectedArchId(),

  setProductData: (product, imagesInput, apiUsed) => {
    const { mainImgs, skuImgs, descImgs, coverImg } = normalizeCollectedProductImages({
      product: product ? { ...product } : {}, images: imagesInput,
    });
    const formattedImages: ProductImage[] = [
      ...mainImgs.map(url => ({ url, type: 'main' as const, selected: false })),
      ...skuImgs.map(url => ({ url, type: 'sku' as const, selected: false })),
      ...descImgs.map(url => ({ url, type: 'detail' as const, selected: false })),
    ];
    const cleanProduct = product ? { ...product, picUrl: coverImg } : null;
    const firstImg = formattedImages[0]?.url || null;

    set({
      product: cleanProduct,
      images: formattedImages,
      apiUsed: apiUsed || null,
      quickRefImage: firstImg || get().quickRefImage,
    });
    requestEcommerceCanvas();
  },

  setSelectedVisionModel: (selectedVisionModel) => {
    setStoredMultimodalModelId(selectedVisionModel);
    set({ selectedVisionModel });
  },

  setSelectedArchId: (selectedArchId) => {
    persistSelectedArchId(selectedArchId);
    set({ selectedArchId });
  },
});

const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set, get) => ({
  currentView: typeof window === 'undefined' ? 'home' : normalizeAppView(new URLSearchParams(window.location.search).get('view')) ?? 'home',
  previousView: null,
  setCurrentView: (currentView) => {
    if (currentView === 'workshop') {
      requestEcommerceCanvas();
      return;
    }
    if (!isAppView(currentView)) currentView = 'home';
    const prev = get().currentView;
    if (prev === currentView) return;
    set({
      currentView,
      previousView: currentView !== 'settings' && prev !== 'settings' ? prev : get().previousView,
    });
  },
  navigateToSettings: () => {
    const current = get().currentView;
    if (current !== 'settings') {
      set({ previousView: current, currentView: 'settings' });
    }
  },
  backFromSettings: () => {
    const target = get().previousView || 'home';
    set({ currentView: target === 'settings' ? 'home' : target });
  },
});

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
} from './persist/index';
