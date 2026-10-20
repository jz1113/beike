import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { classifyGenerationPollResult, imageGenBusinessError } from '@client/shared/api/generation/generationErrors';
import { pollGenerationTask, pollSingleTaskResult, submitImageGenTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling, throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';

export class SalesSubmitUncertainError extends Error {
  constructor(message = '视频提交结果未确认，请先核对是否已经生成，不要立刻重复提交') {
    super(message);
    this.name = 'SalesSubmitUncertainError';
  }
}

export async function generateSalesReferenceFrame(input: {
  prompt: string;
  imageModel?: string;
  referenceImage?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  existingTaskId?: string;
  idempotencyKey?: string;
  onTaskId?: (taskId: string) => void;
  isAborted: () => boolean;
}): Promise<string> {
  if (input.existingTaskId) return (await pollSingleTaskResult(input.existingTaskId, input.isAborted, undefined, input.imageModel)).url;
  const listed = (input.referenceImages || []).map((item) => item.trim()).filter(Boolean);
  const images = listed.length ? listed : (input.referenceImage?.trim() ? [input.referenceImage.trim()] : []);
  const frame = await submitImageGenTask({
    prompt: input.prompt,
    model: input.imageModel,
    aspectRatio: input.aspectRatio || '9:16',
    ...(images.length ? {
      useReferenceImage: true,
      referenceImageUrl: images[0],
      referenceImages: images,
      images,
    } : {}),
  }, { isAborted: input.isAborted, idempotencyKey: input.idempotencyKey, onTaskSubmitted: input.onTaskId });
  if (!frame) throw new Error('参考图重绘没有返回图片');
  return frame;
}

export async function generateSalesShotVideo(input: {
  prompt: string;
  videoModel?: string;
  referenceImage?: string;
  referenceImages?: string[];
  keepAllImages?: boolean;
  duration: number;
  aspectRatio?: string;
  resolution?: string;
  refMode?: string;
  existingTaskId?: string;
  isAborted: () => boolean;
  onTaskId?: (taskId: string) => void;
}): Promise<string> {
  if (input.existingTaskId) return pollVideoTask(input.existingTaskId, input.isAborted);
  const listed = (input.referenceImages || []).map((item) => item.trim()).filter(Boolean);
  const images = listed.length ? listed : (input.referenceImage ? [input.referenceImage] : []);
  if (!images.length) throw new Error('这个镜头还没有参考图');
  return submitSalesVideo({
    prompt: input.prompt,
    model: input.videoModel,
    referenceImages: images,
    keepAllImages: input.keepAllImages,
    duration: input.duration,
    aspectRatio: input.aspectRatio || '9:16',
    resolution: input.resolution,
    refMode: input.refMode,
    isAborted: input.isAborted,
    onTaskId: input.onTaskId,
  });
}

async function submitSalesVideo(input: {
  prompt: string;
  model?: string;
  referenceImages: string[];
  keepAllImages?: boolean;
  duration: number;
  aspectRatio: string;
  resolution?: string;
  refMode?: string;
  isAborted: () => boolean;
  onTaskId?: (taskId: string) => void;
}): Promise<string> {
  throwIfGenerationAborted(input.isAborted);
  const { customBaseUrl, customApiKey } = getGatewayClientOverrides();
  const model = input.model || 'doubao-seedance-2.5';
  let res: Response;
  try {
    res = await apiFetch('/api/generate/video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getGatewayClientHeaders(model),
        ...storageConfigHeaders(),
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model,
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        ref_mode: input.refMode,
        images: input.keepAllImages ? input.referenceImages : input.referenceImages.slice(0, 1),
        ...(input.refMode === 'first_frame' ? { first_frame_image: input.referenceImages[0] } : {}),
        audio: true,
        customBaseUrl,
        customApiKey,
        storageConfig: readClientStorageConfig(),
      }),
    });
  } catch (err) {
    if (input.isAborted()) throw err;
    throw new SalesSubmitUncertainError();
  }
  const data = await res.json().catch(() => null);
  if (data?.taskId) input.onTaskId?.(String(data.taskId));
  if (res.status >= 500 || data?.submissionUnknown) throw new SalesSubmitUncertainError(typeof data?.error === 'string' ? data.error : undefined);
  if (!data) throw new SalesSubmitUncertainError();
  if (res.ok && data.status === 'SUCCESS' && data.resultUrl) return String(data.resultUrl);
  if (!res.ok || data.success === false) {
    if (data.taskId) throw new SalesSubmitUncertainError(data.error || '已有任务回执，请先查询原任务');
    throw imageGenBusinessError(data.error || '视频生成提交失败');
  }
  if (!data.taskId) throw new SalesSubmitUncertainError();
  const taskId = String(data.taskId);
  return pollVideoTask(taskId, input.isAborted);
}

async function pollVideoTask(taskId: string, isAborted: () => boolean): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 360000) {
    throwIfGenerationAborted(isAborted);
    await sleepWhilePolling(2000, isAborted);
    const data = await pollGenerationTask(taskId, 'video');
    const outcome = classifyGenerationPollResult(data, { httpOk: true });
    if (outcome === 'success') return String(data.resultUrl);
    if (outcome === 'failure') throw imageGenBusinessError(data.failReason || data.error || '视频生成失败');
  }
  throw new Error('视频生成超时');
}
