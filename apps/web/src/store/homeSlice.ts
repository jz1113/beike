import type { StateCreator } from 'zustand';
import type { AppState, HomeSlice } from '@/types/store';

export const createHomeSlice: StateCreator<AppState, [], [], HomeSlice> = (set) => ({
  quickGenMode: 'image',
  quickDepthStyle: 'mocap',
  quickDepthQuality: 'standard',
  quickPrompt: '',
  quickRefImage: null,
  quickRefImages: [],
  quickModel: 'gpt-image-2',
  quickAspectId: '3:4',
  quickQuality: 'high',
  quickCount: 1,
  quickVideoModel: 'doubao-seedance-2.0-mini',
  quickVideoDuration: 5,
  quickVideoResolution: '720P',
  quickVideoAspectId: '16:9',
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
  setQuickVideoModel: (quickVideoModel) => set({ quickVideoModel }),
  setQuickVideoDuration: (quickVideoDuration) => set({ quickVideoDuration }),
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
});
