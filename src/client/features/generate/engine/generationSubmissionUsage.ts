import type { GenerationTask } from '@client/store';
import { formatDisplayModel } from '@shared/domain/media/drawing';
import { recordMediaTaskUsage } from '@client/shared/utils/modelUsage';
import { isVideoTask } from './generationTaskTypes';

/** A received usage report belongs to the local operation, even when its result is unknown. */
export function recordSubmissionUsage(task: GenerationTask, data: { model?: unknown; taskId?: unknown; recordId?: unknown; usage?: unknown }) {
  const video = isVideoTask(task);
  const audio = task.mediaType === 'audio';
  const model = typeof data.model === 'string' && data.model || task.model || (video ? 'doubao-seedance-2.5' : audio ? 'speech-2.8-hd' : 'gpt-image-2');
  recordMediaTaskUsage({
    localTaskId: task.id,
    recordId: typeof data.recordId === 'string' ? data.recordId : task.dbId,
    scope: task.usageScope,
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
    modelId: model,
    modelName: formatDisplayModel(model, video),
    type: audio ? 'audio' : video ? 'video' : 'image',
    mediaCount: 1,
    duration: video ? (task.videoDuration || 5) : undefined,
    resolution: video ? task.videoResolution : undefined,
    usage: data.usage,
  });
}
