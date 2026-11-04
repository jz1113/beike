import type { GenerationTask } from '@client/store';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';

/** Resolve the selected channel before uploads and the submission flight claim. */
export function prepareVideoSubmissionInput(task: GenerationTask, baseUrl: string | undefined, images: string[], videos: string[]) {
  const model = task.model || 'doubao-seedance-2.5';
  const resolution = resolveVideoResolution(task.videoResolution, getVideoModelById(model, baseUrl)?.supportedResolutions);
  const error = videoInputError({
    model, baseUrl, refMode: task.videoRefMode || 'omni', images, videos,
    duration: task.videoDuration || 5, resolution, aspectRatio: task.size || '16:9',
  });
  if (error) throw new Error(error);
  return { resolution, ...(isMetasoH3(model, baseUrl) ? { context_ir_enabled: task.videoContextIrEnabled ?? true } : {}) };
}
