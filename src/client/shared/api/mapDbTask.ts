import type { GenerationTask } from '@client/store/appStoreTypes';
import { DEPTH_IMAGE_MODEL_ID, DEPTH_VIDEO_MODEL_ID } from '@shared/domain/media/depthVideo';
import { toUiGenerationStatus } from '@shared/domain/core/taskStatus';
import { getAssetTime, resolveAssetMediaType } from '@client/shared/utils/assetTaskData';

/** Asset archives also accept audio/documents without widening generation submission contracts. */
export type AssetHistoryTask = Omit<GenerationTask, 'mediaType' | 'status' | 'progress' | 'title' | 'size' | 'quality'> & {
  mediaType?: GenerationTask['mediaType'] | 'audio' | 'doc';
  status: GenerationTask['status'] | 'PENDING';
  progress?: string;
  title?: string;
  size?: string;
  quality?: string;
};

export function mapDbTaskToGenerationTask(t: Record<string, unknown>): AssetHistoryTask {
  const model = String(t.model || '');
  const resultUrl = typeof t.resultUrl === 'string' ? t.resultUrl : undefined;
  const mediaType = resolveAssetMediaType(
    model === DEPTH_IMAGE_MODEL_ID ? 'depth-image' : model === DEPTH_VIDEO_MODEL_ID ? 'depth-video' : t.mediaType,
    model,
    resultUrl,
  ) as AssetHistoryTask['mediaType'];
  const status = t.status === 'PENDING' ? 'PENDING' : typeof t.status === 'string' && t.status.trim() ? toUiGenerationStatus(t.status) : resultUrl ? 'SUCCESS' : 'IDLE';
  const prompt = String(t.prompt || '');
  const referenceImages = Array.isArray(t.referenceImages) ? t.referenceImages.filter((url): url is string => typeof url === 'string') : undefined;
  const referenceImageUrl = typeof t.referenceImageUrl === 'string' ? t.referenceImageUrl : undefined;

  return {
    ...t,
    id: String(t.id || t.taskId || ''),
    taskId: typeof t.taskId === 'string' ? t.taskId : mediaType === 'depth-video' ? String(t.id || '') : undefined,
    dbId: String(t.id || ''),
    title: typeof t.title === 'string' && t.title.trim() ? t.title : undefined,
    prompt,
    model,
    mediaType,
    size: typeof t.size === 'string' && t.size.trim() ? t.size : undefined,
    quality: typeof t.quality === 'string' && t.quality.trim() ? t.quality : undefined,
    status,
    resultUrl,
    failReason: typeof t.failReason === 'string' ? t.failReason : undefined,
    progress: typeof t.progress === 'string' ? t.progress : status === 'SUCCESS' ? '100%' : status === 'FAILURE' ? '0%' : undefined,
    createdAt: getAssetTime(t.createdAt),
    referenceImages,
    referenceImageUrl,
    useReferenceImage: Boolean(t.useReferenceImage || referenceImages?.length || referenceImageUrl || t.sourceImageUrl),
  };
}
