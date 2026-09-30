import { ASPECT_RATIOS } from '@shared/domain/media/drawing';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';
import type { HomeSlice } from '@client/store/types';
import { getAssetMediaKind } from './assetMedia';

/** Restore editable inputs without starting a paid generation request. */
export function getAssetRecreationState(task: Record<string, any>): Partial<HomeSlice> | null {
  const kind = getAssetMediaKind(task);
  if (kind !== 'image' && kind !== 'video') return null;
  const source = { ...(task.rawTask || {}), ...Object.fromEntries(Object.entries(task).filter(([, value]) => value !== undefined)) };
  const references = source.referenceImages || source.images || [source.referenceImageUrl || source.sourceImageUrl];
  const images = Array.from(new Set((Array.isArray(references) ? references : []).filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))));
  const state: Partial<HomeSlice> = {
    quickGenMode: kind,
    quickPrompt: source.prompt || '',
    quickRefImages: images,
    quickRefImage: images[0] || null,
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
    quickCount: 1,
    quickVideoCount: 1,
  };
  const aspect = source.size || source.aspectRatio;
  const aspectId = (ASPECT_RATIOS.find(option => option.id === aspect) || ASPECT_RATIOS.find(option => option.id !== 'auto' && option.size === aspect))?.id;
  const supportedModel = listApprovedModels(kind).some(model => model.id === source.model);
  if (kind === 'video') {
    if (supportedModel) state.quickVideoModel = source.model;
    if (aspectId && !['custom', 'auto'].includes(aspectId)) state.quickVideoAspectId = aspectId;
    const resolution = String(source.videoResolution || source.quality || '').toUpperCase();
    if (['480P', '720P', '1080P', '4K'].includes(resolution)) state.quickVideoResolution = resolution as HomeSlice['quickVideoResolution'];
    const duration = Number(source.videoDuration);
    if (Number.isFinite(duration) && duration > 0) state.quickVideoDuration = duration;
    const mode = source.videoRefMode;
    state.quickVideoRefMode = ['first_last_frame', 'multi_frame', 'omni'].includes(mode) ? mode : 'omni';
    if (mode === 'first_last_frame') {
      state.quickVideoFirstFrame = images[0] || null;
      state.quickVideoLastFrame = images[1] || null;
    } else if (mode === 'multi_frame') state.quickVideoMultiFrames = images;
  } else {
    if (supportedModel) state.quickModel = source.model;
    if (aspectId && aspectId !== 'custom') state.quickAspectId = aspectId;
    if (['high', 'medium', 'low'].includes(source.quality)) state.quickQuality = source.quality;
  }
  return state;
}
