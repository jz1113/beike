import type { StateCreator } from 'zustand';
import { ShotPrompt, buildActionDigestFromShots } from '@shared/domain/prompts/vision';
import { normalizeCollectedProductImages } from '@shared/domain/collection/productImages';
import type { ProductImage } from '@client/types';
import {
  getStoredMultimodalModelId,
  setStoredMultimodalModelId,
} from '@shared/domain/models/workflowModels';
import {
  buildSocialPromptSourceKey,
  invalidateSocialPromptsIfNeeded,
  STUDIO_DRAFT_ORIGINAL_KEY,
} from './persist/index';
import {
  persistAnchorFaceToStorage,
  pickEffectiveAnchorFaceImageUrl,
  pickEffectiveIsAnchorFaceConfirmed,
  isOriginalWorkshopMode,
} from './anchorFace';
import {
  applyWorkshopModeSession,
  createDefaultWorkshopSession,
  extractWorkshopModeSession,
  persistModePersonaPref,
  workshopModeSessionKey,
  type WorkshopMode,
} from './workshopSession';
import type { AppState, WorkshopSlice } from '@client/store/types';
import { createWorkshopGenerationActions } from './workshopGenerationActions';

const WORKSHOP_SELECTED_ARCH_KEY = 'workshop_selected_arch_id';
const LEGACY_STYLE_IDS = new Set(['computer_office_monitor', 'arch_atomic_asset_hub', 'arch_jewelry_master']);
const ARCH_ID_ALIASES: Record<string, string> = {
  cmu25767x000011tybm2u7c3t: 'recipe_phone_comms_master',
};

function canonicalizeArchId(id: string): string {
  return ARCH_ID_ALIASES[id] || id;
}

function readInitialSelectedArchId(): string {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = localStorage.getItem(WORKSHOP_SELECTED_ARCH_KEY);
    if (stored && stored.trim() && !LEGACY_STYLE_IDS.has(stored)) return canonicalizeArchId(stored);
    const raw = sessionStorage.getItem('workshop_original_draft');
    if (raw) {
      const draft = JSON.parse(raw) as { selectedStyleId?: string };
      const legacy = draft?.selectedStyleId;
      if (typeof legacy === 'string' && legacy.trim() && !LEGACY_STYLE_IDS.has(legacy)) {
        return canonicalizeArchId(legacy);
      }
    }
  } catch {}
  return 'auto';
}

function persistSelectedArchId(archId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSHOP_SELECTED_ARCH_KEY, archId);
  } catch {}
}

const defaultSocialSession = createDefaultWorkshopSession('storyboard_generate');
const defaultOriginalSession = createDefaultWorkshopSession('storyboard_generate');

export const createWorkshopSlice: StateCreator<AppState, [], [], WorkshopSlice> = (set, get, store) => ({
  socialSessionCache: defaultSocialSession,
  originalSessionCache: defaultOriginalSession,

  ...applyWorkshopModeSession(defaultSocialSession),

  // 全局偏好（两模式共享）
  isLoading: false,
  error: null,
  // Step 2 全局
  selectedVisionModel: typeof window !== 'undefined'
    ? getStoredMultimodalModelId('gemini-3.7-flash')
    : 'gemini-3.7-flash',
  selectedArchId: readInitialSelectedArchId(),
  isAnalyzing: false,

  // Step 3 全局
  selectedImageGenModel: typeof window !== 'undefined'
    ? (localStorage.getItem('ai_image_gen_model') || 'gpt-image-2')
    : 'gpt-image-2',

  workshopMode: 'storyboard_generate' as WorkshopMode,
  anchorFaceImageUrl: undefined,
  isAnchorFaceConfirmed: false,
  originalAnchorFaceImageUrl: undefined,
  originalIsAnchorFaceConfirmed: false,
  socialPromptSourceKey: '',
  pendingBatchPromptImport: null,
  batchStage: 1,
  pendingBatchStage: null,
  pendingFreshWorkshopEntry: false,
  pendingBatchLockedAssets: null,
  getEffectiveAnchorFaceImageUrl: () => pickEffectiveAnchorFaceImageUrl(get()),
  getEffectiveIsAnchorFaceConfirmed: () => pickEffectiveIsAnchorFaceConfirmed(get()),

  setWorkshopMode: (workshopMode) => set((state) => {
    if (workshopMode === state.workshopMode) return {};

    const currentMode = state.workshopMode;
    const currentSnapshot = extractWorkshopModeSession(state);
    const currentCacheKey = workshopModeSessionKey(currentMode);
    const nextCacheKey = workshopModeSessionKey(workshopMode);

    const nextSession = state[nextCacheKey] ?? createDefaultWorkshopSession(workshopMode);
    const applied = applyWorkshopModeSession(nextSession);

    return {
      workshopMode,
      [currentCacheKey]: currentSnapshot,
      ...applied,
      isAnalyzing: false,
      error: null,
    };
  }),

  resetModeSession: (mode) => set((state) => {
    const targetMode = mode ?? state.workshopMode;
    const fresh = createDefaultWorkshopSession(targetMode);
    const cacheKey = workshopModeSessionKey(targetMode);
    const patch: Partial<AppState> = {
      [cacheKey]: fresh,
    };

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(
          STUDIO_DRAFT_ORIGINAL_KEY,
        );
      } catch {}
    }

    if (targetMode === state.workshopMode) {
      Object.assign(patch, applyWorkshopModeSession(fresh), {
        isAnalyzing: false,
        error: null,
      });
    }

    return patch;
  }),
  setSocialGalleryTab: (socialGalleryTab) => set({ socialGalleryTab }),
  setTargetProductImage: (url) => set((state) => {
    const updatedProduct = state.product ? { ...state.product, picUrl: url } : { title: '目标实物商品', picUrl: url };
    const updatedImages = state.images.map(img => ({
      ...img,
      selected: img.url === url
    }));

    return {
      product: updatedProduct,
      images: updatedImages
    };
  }),
  setClonedSocialImages: (imgs) => set((state) => {
    const nextCloned = imgs.map(url => ({ url, selected: true }));
    return {
      clonedSocialImages: nextCloned,
      shotCount: imgs.length > 0 ? imgs.length : 4,
      ...invalidateSocialPromptsIfNeeded(state, nextCloned),
    };
  }),
  toggleClonedSocialImage: (index) => set((state) => {
    const updated = [...state.clonedSocialImages];
    if (updated[index]) {
      updated[index] = { ...updated[index], selected: !updated[index].selected };
    }
    const selectedCount = updated.filter(i => i.selected).length;
    return {
      clonedSocialImages: updated,
      shotCount: selectedCount > 0 ? selectedCount : state.shotCount,
      ...invalidateSocialPromptsIfNeeded(state, updated),
    };
  }),
  selectAllClonedImages: (select) => set((state) => {
    const updated = state.clonedSocialImages.map(img => ({ ...img, selected: select }));
    const selectedCount = updated.filter(i => i.selected).length;
    return {
      clonedSocialImages: updated,
      shotCount: selectedCount > 0 ? selectedCount : (select ? state.clonedSocialImages.length : state.shotCount),
      ...invalidateSocialPromptsIfNeeded(state, updated),
    };
  }),
  setModelPersona: (modelPersona) => {
    const mode = get().workshopMode;
    persistModePersonaPref(mode, modelPersona);
    set({ modelPersona });
  },
  setAnchorFaceImageUrl: (anchorFaceImageUrl) => {
    const isOriginal = isOriginalWorkshopMode(get().workshopMode);
    persistAnchorFaceToStorage(isOriginal, anchorFaceImageUrl);
    set((state) => {
      const isPure =
        !state.modelPersona ||
        state.modelPersona.includes('无人物') ||
        state.modelPersona.includes('无需模特') ||
        state.modelPersona.includes('纯商品') ||
        state.modelPersona.includes('纯静物');
      // 绑定正脸时退出纯商品人设，避免模式与人脸冲突
      let nextPersona = state.modelPersona;
      if (anchorFaceImageUrl && isPure) {
        nextPersona = '🌸 亚洲清纯甜美女生 (日常精致微表情、自然裸妆感)';
        persistModePersonaPref(state.workshopMode, nextPersona);
      }
      if (isOriginal) {
        return {
          originalAnchorFaceImageUrl: anchorFaceImageUrl,
          originalIsAnchorFaceConfirmed: Boolean(anchorFaceImageUrl),
          modelPersona: nextPersona,
        };
      }
      return {
        anchorFaceImageUrl,
        isAnchorFaceConfirmed: Boolean(anchorFaceImageUrl),
        modelPersona: nextPersona,
      };
    });
  },
  setIsAnchorFaceConfirmed: (isAnchorFaceConfirmed) => set((state) => (
    isOriginalWorkshopMode(state.workshopMode)
      ? { originalIsAnchorFaceConfirmed: isAnchorFaceConfirmed }
      : { isAnchorFaceConfirmed }
  )),

  getSelectedSocialPromptKey: () => {
    const state = get();
    return buildSocialPromptSourceKey(state.clonedSocialImages);
  },
  isSocialPromptSourceStale: () => {
    const state = get();
    if (state.workshopMode !== 'storyboard_generate') return false;
    if (!state.socialPromptSourceKey) {
      return state.generatedPrompts.length > 0;
    }
    return buildSocialPromptSourceKey(state.clonedSocialImages) !== state.socialPromptSourceKey;
  },

  setStep: (currentStep) => set({ currentStep }),
  setBatchStage: (batchStage) => set({ batchStage: Math.max(1, Math.min(4, batchStage)) }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

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

    // 如果还没有设置参考图，默认设置商品首图
    const firstImg = formattedImages[0]?.url || null;

    set({
      product: cleanProduct,
      images: formattedImages,
      apiUsed: apiUsed || null,
      error: null,
      currentStep: 1,
      currentView: 'workshop',
      workshopMode: 'storyboard_generate',
      activeWorkshopTab: 'studio',
      quickRefImage: firstImg || get().quickRefImage
    });
  },

  toggleImageSelection: (index) => set((state) => {
    const newImages = [...state.images];
    if (newImages[index]) {
      newImages[index].selected = !newImages[index].selected;
    }
    return { images: newImages };
  }),

  selectAllImages: (type) => set((state) => {
    const newImages = state.images.map(img => {
      if (!type || img.type === type) {
        return { ...img, selected: true };
      }
      return img;
    });
    return { images: newImages };
  }),

  clearSelection: () => set((state) => {
    const newImages = state.images.map(img => ({ ...img, selected: false }));
    return { images: newImages };
  }),

  deselectAllImages: () => set((state) => {
    const newImages = state.images.map(img => ({ ...img, selected: false }));
    return { images: newImages };
  }),

  // Step 2 Actions
  setSelectedVisionModel: (selectedVisionModel) => {
    setStoredMultimodalModelId(selectedVisionModel);
    set({ selectedVisionModel });
  },
  setSelectedArchId: (selectedArchId) => {
    persistSelectedArchId(selectedArchId);
    set({ selectedArchId });
  },
  setShotCount: (shotCount) => set({ shotCount }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  setGeneratedPrompts: (generatedPrompts, productFingerprint, meta) => {
    const state = get();
    const socialPromptSourceKey = '';

    const nextMaster = meta?.masterScene !== undefined ? meta.masterScene : state.masterScene;
    const nextLook = meta?.lookBible !== undefined ? meta.lookBible : state.lookBible;
    const nextIdentity = meta?.identityBible !== undefined ? meta.identityBible : state.identityBible;
    const nextStyle = meta?.styleBible !== undefined ? meta.styleBible : state.styleBible;
    const nextLookParts = meta?.lookParts !== undefined ? meta.lookParts : state.lookParts;
    const nextProductRole = meta?.productRole !== undefined ? meta.productRole : state.productRole;
    const nextActionDigest =
      meta?.actionDigest ||
      buildActionDigestFromShots(generatedPrompts);

    // 覆盖前把旧组签名推进反雷同历史
    let previousMasterScenes = [...(state.previousMasterScenes || [])];
    let previousGroupSignatures = [...(state.previousGroupSignatures || [])];
    if (
      state.masterScene &&
      nextMaster &&
      state.masterScene.trim() &&
      state.masterScene.trim() !== nextMaster.trim()
    ) {
      previousMasterScenes = [state.masterScene.trim(), ...previousMasterScenes]
        .filter((s, i, arr) => s && arr.indexOf(s) === i)
        .slice(0, 2);
      const oldDigest = buildActionDigestFromShots(state.generatedPrompts);
      previousGroupSignatures = [
        { scene: state.masterScene.trim(), actionDigest: oldDigest },
        ...previousGroupSignatures,
      ]
        .filter((s, i, arr) => s.scene && arr.findIndex((x) => x.scene === s.scene) === i)
        .slice(0, 3);
    }

    set({
      generatedPrompts,
      socialPromptSourceKey,
      masterScene: nextMaster || '',
      lookBible: nextLook || '',
      identityBible: nextIdentity || '',
      styleBible: nextStyle || '',
      lookParts: nextLookParts || null,
      productRole: nextProductRole || null,
      previousMasterScenes,
      previousGroupSignatures,
      ...(productFingerprint ? { productFingerprint } : {}),
    });
    // 新 digest 仅用于下一次反雷同；当前组已写入 previous 的是「上一组」
    void nextActionDigest;
    get().initWorkshopTasks(true);
  },

  setMasterScene: (masterScene) => set({ masterScene }),
  setLookBible: (lookBible) => set({ lookBible }),
  setIdentityBible: (identityBible) => set({ identityBible }),
  setStyleBible: (styleBible) => set({ styleBible }),
  setLookParts: (lookParts) => set({ lookParts }),
  setProductRole: (productRole) => set({ productRole }),
  setSceneAnchorEnabled: (sceneAnchorEnabled) => set({ sceneAnchorEnabled }),

  setPendingBatchPromptImport: (pendingBatchPromptImport) => set({ pendingBatchPromptImport }),
  setPendingBatchStage: (pendingBatchStage) => set({ pendingBatchStage }),
  setPendingBatchLockedAssets: (pendingBatchLockedAssets) => set({ pendingBatchLockedAssets }),

  updateShotPrompt: (index, newPrompt) => set((state) => {
    const newPrompts = [...state.generatedPrompts];
    if (newPrompts[index]) {
      newPrompts[index] = { ...newPrompts[index], ...newPrompt };
    }
    const updatedTasks = state.workshopTasks.map((task, tIdx) => {
      if (tIdx === index && newPrompt.productImageUrl) {
        return { ...task, productImageUrl: newPrompt.productImageUrl };
      }
      return task;
    });
    return { generatedPrompts: newPrompts, workshopTasks: updatedTasks };
  }),

  toggleShotSelection: (index) => set((state) => {
    const newPrompts = [...state.generatedPrompts];
    if (newPrompts[index]) {
      newPrompts[index].selected = newPrompts[index].selected === false ? true : false;
    }
    return { generatedPrompts: newPrompts };
  }),

  addShotPrompt: (prompt) => set((state) => {
    const nextShotNo = state.generatedPrompts.length + 1;
    const newShot: ShotPrompt = {
      shot_no: nextShotNo,
      title: `自定义分镜 ${nextShotNo}`,
      prompt: prompt?.prompt || '商品特写与自然环境交互拍摄，真实柔和自然光...',
      selected: true,
      ...prompt
    };
    return { generatedPrompts: [...state.generatedPrompts, newShot] };
  }),

  deleteShotPrompt: (index) => set((state) => {
    const filtered = state.generatedPrompts.filter((_, i) => i !== index);
    const reindexed = filtered.map((item, i) => ({ ...item, shot_no: i + 1 }));
    return { generatedPrompts: reindexed };
  }),

  ...createWorkshopGenerationActions(set, get, store),

});
