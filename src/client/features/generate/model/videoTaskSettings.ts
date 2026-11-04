import type { AppState, GenerationTask } from '@client/store';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { getAspectRatioFromSize } from '@shared/domain/media/drawing';

type VideoSettingsStore = Pick<AppState, 'setQuickVideoModel' | 'setQuickVideoAspectId' | 'setQuickVideoDuration' | 'setQuickVideoResolution' | 'setQuickVideoContextIrEnabled'>;

/** Reuse the saved channel and explicit false values from restored tasks. */
export function restoreVideoTaskSettings(store: VideoSettingsStore, task: GenerationTask) {
  const selection = task.modelRouteKey || task.model;
  if (selection) store.setQuickVideoModel(selection);
  store.setQuickVideoAspectId(getAspectRatioFromSize(task.size));
  store.setQuickVideoDuration(task.videoDuration || 5);
  store.setQuickVideoContextIrEnabled(task.videoContextIrEnabled ?? true);
  const resolution = task.videoResolution || task.quality;
  store.setQuickVideoResolution(resolveVideoResolution(resolution, getVideoModelById(task.model, getGatewayClientBaseUrl(selection))?.supportedResolutions));
}
