import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoModes, videoRatioLocked } from '@shared/domain/media/videoCapabilities';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

/** Keep persisted controls valid when changing model, workflow, or output quality. */
export function useVideoParameterConstraints() {
  const state = useAppStore(useShallow(s => ({
    mode: s.quickGenMode, model: s.quickVideoModel, refMode: s.quickVideoRefMode,
    resolution: s.quickVideoResolution, aspect: s.quickVideoAspectId, duration: s.quickVideoDuration,
    references: s.quickRefImages,
  })));
  useEffect(() => {
    if (state.mode !== 'video') return;
    const profile = getVideoModelById(state.model);
    if (!profile) return;
    const store = useAppStore.getState();
    const resolved = resolveVideoMode(state.model, state.refMode, state.references.filter(url => !isVideoMediaUrl(url)).length, state.references.filter(isVideoMediaUrl).length);
    const modes = videoModes(state.model);
    const mode = modes.some(item => item.id === resolved) ? resolved : modes[0].id;
    const resolution = resolveVideoResolution(state.resolution, profile.supportedResolutions);
    const aspect = videoRatioLocked(state.model, mode) ? 'adaptive' : profile.supportedAspectRatios.includes(state.aspect) ? state.aspect : profile.supportedAspectRatios[0];
    const durations = videoDurationOptions(state.model, resolution, mode);
    const duration = durations.includes(state.duration) ? state.duration : durations.reduce((best, value) => Math.abs(value - state.duration) < Math.abs(best - state.duration) ? value : best);
    if (state.refMode !== mode) store.setQuickVideoRefMode(mode);
    if (state.resolution !== resolution) store.setQuickVideoResolution(resolution);
    if (state.aspect !== aspect) store.setQuickVideoAspectId(aspect);
    if (state.duration !== duration) store.setQuickVideoDuration(duration);
  }, [state]);
}
