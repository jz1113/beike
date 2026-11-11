import type { StateCreator } from 'zustand';
import type { AppState, HomeSlice } from '@client/store/types';
import { loadPromptPreferences, savePromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';

import { imageOutputTier } from '@shared/domain/media/imageCapabilities';
import { resolveVideoResolution } from '@shared/domain/media/video';

export const createHomeSlice: StateCreator<AppState, [], [], HomeSlice> = (set) => {
  let attachmentController = new AbortController();
  const preferences = loadPromptPreferences();
  return {
    quickGenMode: 'agent',
    quickDepthStyle: 'mocap',
    quickDepthQuality: 'standard',
    quickPrompt: '',
    pendingAttachmentReads: 0,
    invalidatePromptAttachments: () => {
      const previous = attachmentController;
      attachmentController = new AbortController();
      previous.abort();
      set({ pendingAttachmentReads: 0 });
    },
    readPromptAttachments: async (read) => {
      const { signal } = attachmentController;
      const isCurrent = () => !signal.aborted;
      set(state => ({ pendingAttachmentReads: state.pendingAttachmentReads + 1 }));
      try {
        await read(isCurrent, signal);
      } catch (error) {
        if (isCurrent()) throw error;
      } finally {
        if (isCurrent()) set(state => ({ pendingAttachmentReads: state.pendingAttachmentReads - 1 }));
      }
    },
    quickRefImage: null,
    quickRefImages: [],
    quickModel: 'gpt-image-2',
    quickAspectId: preferences.image.aspect,
    quickQuality: imageOutputTier(preferences.image.resolution),
    quickCount: 1,
    quickAudioModel: 'speech-2.8-hd',
    quickVideoModel: 'doubao-seedance-2.0-mini',
    quickVideoDuration: preferences.video.customDurationSec,
    quickVideoContextIrEnabled: preferences.video.contextIrEnabled ?? true,
    quickVideoResolution: resolveVideoResolution(preferences.video.resolution),
    quickVideoAspectId: preferences.video.aspect === 'smart' ? 'adaptive' : preferences.video.aspect,
    quickVideoRefMode: 'omni',
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
    quickVideoCount: 1,

    setQuickGenMode: (quickGenMode) => set({ quickGenMode }),
    setQuickDepthStyle: (quickDepthStyle) => set({ quickDepthStyle }),
    setQuickDepthQuality: (quickDepthQuality) => set({ quickDepthQuality }),
    setQuickPrompt: (quickPrompt) => set({ quickPrompt }),
    setQuickRefImage: (quickRefImage) => set({
      quickRefImage,
      quickRefImages: quickRefImage ? [quickRefImage] : []
    }),
    setQuickRefImages: (quickRefImages) => set({
      quickRefImages,
      quickRefImage: quickRefImages[0] || null
    }),
    addQuickRefImage: (url) => set((state) => {
      const newImages = [...state.quickRefImages, url];
      return {
        quickRefImages: newImages,
        quickRefImage: newImages[0] || null
      };
    }),
    removeQuickRefImage: (index) => set((state) => {
      const newImages = state.quickRefImages.filter((_, i) => i !== index);
      return {
        quickRefImages: newImages,
        quickRefImage: newImages[0] || null
      };
    }),
    setQuickModel: (quickModel) => set({ quickModel }),
    setQuickAspectId: (quickAspectId) => set({ quickAspectId }),
    setQuickQuality: (quickQuality) => set({ quickQuality }),
    setQuickCount: (quickCount) => set({ quickCount }),
    setQuickAudioModel: (quickAudioModel) => set({ quickAudioModel }),
    setQuickVideoModel: (quickVideoModel) => set({ quickVideoModel }),
    setQuickVideoDuration: (quickVideoDuration) => set({ quickVideoDuration }),
    setQuickVideoContextIrEnabled: (quickVideoContextIrEnabled) => {
      const prefs = loadPromptPreferences();
      savePromptPreferences({ ...prefs, video: { ...prefs.video, contextIrEnabled: quickVideoContextIrEnabled } });
      set({ quickVideoContextIrEnabled });
    },
    setQuickVideoResolution: (quickVideoResolution) => set({ quickVideoResolution }),
    setQuickVideoAspectId: (quickVideoAspectId) => set({ quickVideoAspectId }),
    setQuickVideoRefMode: (quickVideoRefMode) => set({ quickVideoRefMode }),
    setQuickVideoFirstFrame: (quickVideoFirstFrame) => set({ quickVideoFirstFrame }),
    setQuickVideoLastFrame: (quickVideoLastFrame) => set({ quickVideoLastFrame }),
    swapVideoFirstLastFrames: () => set((state) => ({
      quickVideoFirstFrame: state.quickVideoLastFrame,
      quickVideoLastFrame: state.quickVideoFirstFrame
    })),
    setQuickVideoMultiFrames: (quickVideoMultiFrames) => set({ quickVideoMultiFrames }),
    addQuickVideoMultiFrame: (frame) => set((state) => ({
      quickVideoMultiFrames: [...state.quickVideoMultiFrames, frame]
    })),
    removeQuickVideoMultiFrame: (index) => set((state) => ({
      quickVideoMultiFrames: state.quickVideoMultiFrames.filter((_, i) => i !== index)
    })),
    setQuickVideoCount: (quickVideoCount) => set({ quickVideoCount }),
  };
};
