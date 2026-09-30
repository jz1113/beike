import type { GenerationTask } from '@client/store';
import { DEPTH_IMAGE_MODEL_ID, DEPTH_VIDEO_MODEL_ID } from '@shared/domain/media/depthVideo';

export function isDepthVideoTask(task: GenerationTask): boolean {
  if (isDepthImageTask(task)) return false;
  return task.mediaType === 'depth-video' || task.model === DEPTH_VIDEO_MODEL_ID ||
    task.id.startsWith('depth_') || Boolean(task.taskId?.startsWith('depth_'));
}

export function isDepthImageTask(task: GenerationTask): boolean {
  return task.mediaType === 'depth-image' || task.model === DEPTH_IMAGE_MODEL_ID;
}

export function isGenerationVideoTask(task: GenerationTask): boolean {
  if (isDepthImageTask(task)) return false;
  return isDepthVideoTask(task) || task.mediaType === 'video' ||
    /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(task.resultUrl || '') ||
    /seedance|veo|kling|sora|gen3|minimax|h3|hailuo|wan|vidu|luma|hunyuan/i.test(task.model || '');
}
