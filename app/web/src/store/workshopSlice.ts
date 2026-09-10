import type { StateCreator } from 'zustand';
import { apiFetch } from '@/lib/apiClient';
import { ShotPrompt, buildActionDigestFromShots } from '@beike/shared/vision';
import { ASPECT_RATIOS, normalizeImageUrlToStandardJpg } from '@beike/shared/drawing';
import type { ProductImage } from '@/types';
import type { GenerationTask } from '@/types/app-store';
import {
  getStoredMultimodalModelId,
  setStoredMultimodalModelId,
} from '@beike/shared/workflowModels';
import {
  buildSocialPromptSourceKey,
  invalidateSocialPromptsIfNeeded,
  STUDIO_DRAFT_SOCIAL_KEY,
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
import type { AppState, WorkshopSlice } from '@/types/store';

const WORKSHOP_SELECTED_ARCH_KEY = 'workshop_selected_arch_id';
const LEGACY_STYLE_IDS = new Set(['computer_office_monitor', 'auto', 'arch_atomic_asset_hub', 'arch_jewelry_master']);

function readInitialSelectedArchId(): string {
  if (typeof window === 'undefined') return 'recipe_jewelry_master';
  try {
    const stored = localStorage.getItem(WORKSHOP_SELECTED_ARCH_KEY);
    if (stored && stored.trim() && !LEGACY_STYLE_IDS.has(stored)) return stored;
    const raw = sessionStorage.getItem('workshop_original_draft');
    if (raw) {
      const draft = JSON.parse(raw) as { selectedStyleId?: string };
      const legacy = draft?.selectedStyleId;
      if (typeof legacy === 'string' && legacy.trim() && !LEGACY_STYLE_IDS.has(legacy)) {
        return legacy;
      }
    }
  } catch {}
  return 'recipe_jewelry_master';
}

function persistSelectedArchId(archId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSHOP_SELECTED_ARCH_KEY, archId);
  } catch {}
}

const defaultSocialSession = createDefaultWorkshopSession('social_face_product_swap');
const defaultOriginalSession = createDefaultWorkshopSession('storyboard_generate');

export const createWorkshopSlice: StateCreator<AppState, [], [], WorkshopSlice> = (set, get) => ({
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

  workshopMode: 'social_face_product_swap' as WorkshopMode,
  anchorFaceImageUrl: undefined,
  isAnchorFaceConfirmed: false,
  originalAnchorFaceImageUrl: undefined,
  originalIsAnchorFaceConfirmed: false,
  socialPromptSourceKey: '',
  pendingBatchPromptImport: null,
  pendingBatchStage: null,
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

    if (workshopMode === 'social_face_product_swap') {
      const selectedCount = applied.clonedSocialImages?.filter(i => i.selected).length ?? 0;
      if (selectedCount > 0) {
        applied.shotCount = selectedCount;
      }
    }

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
          targetMode === 'social_face_product_swap' ? STUDIO_DRAFT_SOCIAL_KEY : STUDIO_DRAFT_ORIGINAL_KEY,
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

    // 异步同步到数据库，确保只持久化用户当前选定的实物图链接
    if (state.product?.id) {
      apiFetch('/api/catalog/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.product.id,
          picUrl: url,
          selectedImages: [url]
        })
      }).catch(() => {});
    }

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
    if (state.workshopMode !== 'social_face_product_swap') return false;
    if (!state.socialPromptSourceKey) {
      return state.generatedPrompts.length > 0;
    }
    return buildSocialPromptSourceKey(state.clonedSocialImages) !== state.socialPromptSourceKey;
  },

  setStep: (currentStep) => set({ currentStep }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  setProductData: (product, imagesInput, apiUsed) => {
    const toArray = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(String).filter(Boolean);
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {}
        return [val].filter(Boolean);
      }
      return [];
    };

    const rawMain = imagesInput?.main;
    const rawDetails = imagesInput?.details;
    const rawSkus = imagesInput?.skus;

    const mainList = toArray(rawMain);
    const skusList = toArray(rawSkus);
    const detailsList = toArray(rawDetails);

    const formattedImages: ProductImage[] = [
      ...mainList.map(url => ({ url: normalizeImageUrlToStandardJpg(url), type: 'main' as const, selected: false })),
      ...skusList.map(url => ({ url: normalizeImageUrlToStandardJpg(url), type: 'sku' as const, selected: false })),
      ...detailsList.map(url => ({ url: normalizeImageUrlToStandardJpg(url), type: 'detail' as const, selected: false }))
    ].filter(img => Boolean(img.url));

    const cleanProduct = product ? {
      ...product,
      picUrl: normalizeImageUrlToStandardJpg(product.picUrl)
    } : null;

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
    const socialPromptSourceKey =
      state.workshopMode === 'social_face_product_swap'
        ? buildSocialPromptSourceKey(state.clonedSocialImages)
        : '';

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

  // Step 3 Actions
  setSelectedImageGenModel: (selectedImageGenModel) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_image_gen_model', selectedImageGenModel);
      } catch {}
    }
    set((state) => {
      const updatedTasks = state.workshopTasks.map(t =>
        t.status !== 'SUCCESS' ? { ...t, model: selectedImageGenModel } : t
      );
      return { selectedImageGenModel, workshopTasks: updatedTasks };
    });
  },

  setSelectedAspectId: (selectedAspectId) => set((state) => {
    const aspect = ASPECT_RATIOS.find(a => a.id === selectedAspectId) || ASPECT_RATIOS.find(a => a.id === '3:4') || ASPECT_RATIOS[0];
    const updatedTasks = state.workshopTasks.map(t =>
      t.status !== 'SUCCESS' ? { ...t, size: aspect.size } : t
    );
    return { selectedAspectId, workshopTasks: updatedTasks };
  }),

  setSelectedQuality: (selectedQuality) => set((state) => {
    const updatedTasks = state.workshopTasks.map(t =>
      t.status !== 'SUCCESS' ? { ...t, quality: selectedQuality } : t
    );
    return { selectedQuality, workshopTasks: updatedTasks };
  }),

  setUseReferenceImage: (useReferenceImage) => set((state) => {
    const updatedTasks = state.workshopTasks.map(t =>
      t.status !== 'SUCCESS' ? { ...t, useReferenceImage } : t
    );
    return { useReferenceImage, workshopTasks: updatedTasks };
  }),

  setIsBatchGenerating: (isBatchGenerating) => set({ isBatchGenerating }),

  initWorkshopTasks: (forceReset = false) => {
    const state = get();
    const isSocialMode = state.workshopMode === 'social_face_product_swap';
    const selectedClonedList = state.clonedSocialImages.filter(i => i.selected);

    const selectedPrompts = state.generatedPrompts.filter(p => p.selected !== false);
    let effectivePrompts = selectedPrompts.length > 0 ? selectedPrompts : state.generatedPrompts;

    // 🌟 爆款复刻模式下：严格保证分镜任务数量与用户勾选的爆款参考图数量 1:1 严格一致 (选 5 张出 5 张)
    if (isSocialMode && selectedClonedList.length > 0) {
      effectivePrompts = effectivePrompts.slice(0, selectedClonedList.length);
    }

    const aspect = ASPECT_RATIOS.find(a => a.id === state.selectedAspectId) || ASPECT_RATIOS[0];

    // 获取用户当前勾选的商品底图列表
    const userSelectedImages = state.images.filter(img => img.selected);
    const effectiveImages = userSelectedImages.length > 0 ? userSelectedImages : state.images.slice(0, 4);
    const primarySelectedImage = effectiveImages[0];

    const tasks: GenerationTask[] = effectivePrompts.map((p, idx) => {
      // 🌟 1. 商品实物素材图精准绑定 (分镜显式指定 > 严格 1对1 槽位分配用户勾选底图)
      const shotProductImage = p.productImageUrl || effectiveImages[idx % effectiveImages.length]?.url || primarySelectedImage?.url;

      // 换人换品工坊下，每个分镜精准绑定其对应的已勾选社媒参考图作为垫图/ControlNet基准
      const shotRefImage = state.workshopMode === 'social_face_product_swap'
        ? (selectedClonedList[idx]?.url || primarySelectedImage?.url)
        : primarySelectedImage?.url;

      const existing = state.workshopTasks.find(t => t.id === `shot-${idx}`);

      const isPurePersona =
        !state.modelPersona ||
        state.modelPersona.includes('无人物') ||
        state.modelPersona.includes('无需模特') ||
        state.modelPersona.includes('纯商品') ||
        state.modelPersona.includes('纯静物');

      const forcedHasHuman = isPurePersona ? false : p.has_human;
      const forcedShotType = isPurePersona
        ? 'pure_product'
        : (p.shot_type || (forcedHasHuman ? 'model_shot' : 'pure_product'));

      // 仅当非强制重置、且提示词内容未发生变化、且参考底图一致、且已有成功结果时，才保留旧图结果；
      // 换新任务/换商品/修改提示词/点击强制重置时，彻底初始化为崭新的待生成任务！
      if (
        !forceReset &&
        existing &&
        existing.status === 'SUCCESS' &&
        existing.resultUrl &&
        existing.prompt?.trim() === p.prompt?.trim() &&
        existing.referenceImageUrl === shotRefImage &&
        existing.productImageUrl === shotProductImage &&
        existing.has_human === forcedHasHuman &&
        existing.shot_type === forcedShotType
      ) {
        return existing;
      }

      return {
        id: `shot-${idx}`,
        shotNo: p.shot_no || idx + 1,
        title: p.title || `分镜 ${idx + 1}`,
        prompt: p.prompt || p.title || '',
        scene: p.scene || state.masterScene || undefined,
        expression: p.expression,
        action: p.action,
        camera_focal_length: p.camera_focal_length,
        angle: p.angle,
        lighting_type: p.lighting_type,
        model: state.selectedImageGenModel,
        size: aspect.size,
        quality: state.selectedQuality,
        has_human: forcedHasHuman,
        shot_type: forcedShotType,
        productImageUrl: shotProductImage,
        referenceImageUrl: shotRefImage,
        useReferenceImage: state.workshopMode === 'social_face_product_swap' ? true : state.useReferenceImage,
        status: 'IDLE',
        progress: '0%',
        createdAt: Date.now()
      };
    });

    set({ workshopTasks: tasks });
  },

  updateWorkshopTask: (id, updates) => set((state) => {
    const newTasks = state.workshopTasks.map(task => {
      if (task.id === id) {
        return { ...task, ...updates };
      }
      return task;
    });
    return { workshopTasks: newTasks };
  }),

  setAllTasksStatus: (status) => set((state) => {
    const newTasks = state.workshopTasks.map(t => ({ ...t, status }));
    return { workshopTasks: newTasks };
  }),
});
