import type { StateCreator } from 'zustand';
import { ASPECT_RATIOS } from '@shared/domain/media/drawing';
import type { GenerationTask } from '@client/store/appStoreTypes';
import type { AppState, WorkshopSlice } from '@client/store/types';

type WorkshopGenerationActions = Pick<WorkshopSlice,
  | 'setSelectedImageGenModel'
  | 'setSelectedAspectId'
  | 'setSelectedQuality'
  | 'setUseReferenceImage'
  | 'setIsBatchGenerating'
  | 'initWorkshopTasks'
  | 'updateWorkshopTask'
  | 'setAllTasksStatus'
>;

export const createWorkshopGenerationActions: StateCreator<AppState, [], [], WorkshopGenerationActions> = (set, get) => ({
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
    const selectedPrompts = state.generatedPrompts.filter(p => p.selected !== false);
    const effectivePrompts = selectedPrompts.length > 0 ? selectedPrompts : state.generatedPrompts;

    const aspect = ASPECT_RATIOS.find(a => a.id === state.selectedAspectId) || ASPECT_RATIOS[0];

    // 获取用户当前勾选的商品底图列表
    const userSelectedImages = state.images.filter(img => img.selected);
    const effectiveImages = userSelectedImages.length > 0 ? userSelectedImages : state.images.slice(0, 4);
    const primarySelectedImage = effectiveImages[0];

    const tasks: GenerationTask[] = effectivePrompts.map((p, idx) => {
      // 🌟 1. 商品实物素材图精准绑定 (分镜显式指定 > 严格 1对1 槽位分配用户勾选底图)
      const shotProductImage = p.productImageUrl || effectiveImages[idx % effectiveImages.length]?.url || primarySelectedImage?.url;

      // 换人换品工坊下，每个分镜精准绑定其对应的已勾选社媒参考图作为垫图/ControlNet基准
      const shotRefImage = primarySelectedImage?.url;

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
        useReferenceImage: state.useReferenceImage,
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
