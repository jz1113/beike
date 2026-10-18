import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_ANY_ARRAY: unknown[] = [];

export function usePromptBarStoreState() {
  return useAppStore(
    useShallow((s) => ({
      quickGenMode: s.quickGenMode ?? 'agent',
      setQuickGenMode: s.setQuickGenMode,
      quickDepthStyle: s.quickDepthStyle ?? 'mocap',
      setQuickDepthStyle: s.setQuickDepthStyle,
      quickDepthQuality: s.quickDepthQuality ?? 'standard',
      setQuickDepthQuality: s.setQuickDepthQuality,
      quickPrompt: s.quickPrompt,
      setQuickPrompt: s.setQuickPrompt,
      quickRefImages: s.quickRefImages ?? EMPTY_STRING_ARRAY,
      setQuickRefImages: s.setQuickRefImages,
      addQuickRefImage: s.addQuickRefImage,
      removeQuickRefImage: s.removeQuickRefImage,
      quickModel: s.quickModel,
      setQuickModel: s.setQuickModel,
      quickAspectId: s.quickAspectId,
      setQuickAspectId: s.setQuickAspectId,
      quickQuality: s.quickQuality,
      setQuickQuality: s.setQuickQuality,
      quickCount: s.quickCount,
      setQuickCount: s.setQuickCount,
      quickAudioModel: s.quickAudioModel ?? '',
      setQuickAudioModel: s.setQuickAudioModel,
      quickVideoModel: s.quickVideoModel ?? '',
      setQuickVideoModel: s.setQuickVideoModel,
      quickVideoDuration: s.quickVideoDuration ?? 5,
      setQuickVideoDuration: s.setQuickVideoDuration,
      quickVideoResolution: s.quickVideoResolution ?? '480P',
      setQuickVideoResolution: s.setQuickVideoResolution,
      quickVideoAspectId: s.quickVideoAspectId ?? '16:9',
      setQuickVideoAspectId: s.setQuickVideoAspectId,
      quickVideoRefMode: s.quickVideoRefMode ?? 'omni',
      setQuickVideoRefMode: s.setQuickVideoRefMode,
      quickVideoFirstFrame: s.quickVideoFirstFrame,
      quickVideoLastFrame: s.quickVideoLastFrame,
      setQuickVideoFirstFrame: s.setQuickVideoFirstFrame,
      setQuickVideoLastFrame: s.setQuickVideoLastFrame,
      swapVideoFirstLastFrames: s.swapVideoFirstLastFrames,
      quickVideoMultiFrames: s.quickVideoMultiFrames ?? EMPTY_STRING_ARRAY,
      setQuickVideoMultiFrames: s.setQuickVideoMultiFrames,
      addQuickVideoMultiFrame: s.addQuickVideoMultiFrame,
      removeQuickVideoMultiFrame: s.removeQuickVideoMultiFrame,
      quickVideoCount: s.quickVideoCount ?? 1,
      setQuickVideoCount: s.setQuickVideoCount,
      currentView: s.currentView,
      images: s.images ?? EMPTY_ANY_ARRAY,
    })),
  );
}
