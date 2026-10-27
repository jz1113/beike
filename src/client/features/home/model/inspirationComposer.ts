import type { HomeSlice } from '@client/store/types';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import type { InspirationUseOptions } from './inspirationItem';

/** Apply one complete reference selection without retaining frames from a previous draft. */
export function inspirationComposerState(prompt: string, refMedia?: string, options?: InspirationUseOptions): Partial<HomeSlice> {
  const video = Boolean(options || (refMedia && isVideoMediaUrl(refMedia)));
  const references = options?.referenceImages?.length ? [...options.referenceImages] : refMedia ? [refMedia] : [];
  const mode = options?.videoRefMode || 'omni';
  const state: Partial<HomeSlice> = {
    quickPrompt: prompt,
    quickGenMode: video ? 'video' : 'image',
    quickRefImage: references[0] || null,
    quickRefImages: references,
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
  };
  if (video) {
    state.quickVideoRefMode = mode;
    if (mode === 'first_last_frame') {
      state.quickVideoFirstFrame = references[0] || null;
      state.quickVideoLastFrame = references[1] || null;
      state.quickRefImage = null;
      state.quickRefImages = [];
    } else if (mode === 'multi_frame') {
      state.quickVideoMultiFrames = references;
      state.quickRefImage = null;
      state.quickRefImages = [];
    }
    if (options?.videoDuration) state.quickVideoDuration = options.videoDuration;
    if (options?.videoModel) state.quickVideoModel = options.videoModel;
    if (options?.videoAspectId) state.quickVideoAspectId = options.videoAspectId;
    if (options?.videoResolution) state.quickVideoResolution = options.videoResolution;
  }
  return state;
}
