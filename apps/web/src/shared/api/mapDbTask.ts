import type { GenerationTask } from '@/types/app-store';
import { DEPTH_IMAGE_MODEL_ID, DEPTH_VIDEO_MODEL_ID } from '@beike/domain/depthVideo';
import { toUiGenerationStatus } from '@beike/domain/taskStatus';

function resolveUiStatus(rawStatus: unknown, resultUrl: string | undefined): GenerationTask['status'] {
  if (typeof rawStatus === 'string' && rawStatus.trim()) {
    return toUiGenerationStatus(rawStatus);
  }
  return resultUrl ? 'SUCCESS' : 'IDLE';
}

export function mapDbTaskToGenerationTask(t: Record<string, unknown>): GenerationTask {
  const mediaType = t.mediaType as string | undefined;
  const resultUrl = typeof t.resultUrl === 'string' && t.resultUrl ? t.resultUrl : undefined;
  const model = (t.model as string) || '';

  const depthMediaType =
    mediaType === 'depth-image' || model === DEPTH_IMAGE_MODEL_ID
      ? 'depth-image'
      : mediaType === 'depth-video' || model === DEPTH_VIDEO_MODEL_ID
        ? 'depth-video'
        : null;

  const status = resolveUiStatus(t.status, resultUrl);
  const createdAtRaw = t.createdAt;
  const createdAt =
    typeof createdAtRaw === 'number'
      ? createdAtRaw
      : new Date(createdAtRaw as string | Date).getTime();
  const prompt = (t.prompt as string) || '';

  if (depthMediaType) {
    return {
      id: t.id as string,
      taskId: depthMediaType === 'depth-video'
        ? ((t.taskId as string) || (t.id as string))
        : ((t.taskId as string) || undefined),
      dbId: t.id as string,
      title: prompt.slice(0, 25) || (depthMediaType === 'depth-video' ? '深度动作捕捉' : '深度图片'),
      prompt,
      model,
      mediaType: depthMediaType,
      size: (t.size as string) || '-',
      quality: (t.quality as string) || '',
      status,
      resultUrl,
      failReason: (t.failReason as string) || undefined,
      progress: status === 'SUCCESS' ? '100%' : status === 'FAILURE' ? '0%' : '65%',
      createdAt,
      useReferenceImage: false,
    };
  }

  const video =
    mediaType === 'video' ||
    Boolean(resultUrl?.includes('.mp4')) ||
    /seedance|veo|kling|sora|minimax|h3|wan|vidu|omni_flash/i.test(model);

  return {
    id: t.id as string,
    taskId: (t.taskId as string) || undefined,
    dbId: t.id as string,
    title: prompt.slice(0, 25) || (video ? 'AI 视频创作' : 'AI 生图'),
    prompt,
    model,
    mediaType: video ? 'video' : 'image',
    size: (t.size as string) || (video ? '16:9' : '3:4'),
    quality: (t.quality as string) || (video ? '720P' : 'high'),
    status,
    resultUrl,
    failReason: (t.failReason as string) || undefined,
    progress: status === 'SUCCESS' ? '100%' : status === 'FAILURE' ? '0%' : '65%',
    createdAt,
    useReferenceImage: false,
  };
}
