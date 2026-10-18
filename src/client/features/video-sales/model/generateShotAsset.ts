import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { classifyGenerationPollResult, imageGenBusinessError } from '@client/shared/api/generation/generationErrors';
import { pollGenerationTask, submitImageGenTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling, throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';
import { clampVideoDuration, getVideoModelById } from '@shared/domain/media/video';

export function shotWantsVideo(transition: string | undefined): boolean {
  return transition === 'ai_start_end' || transition === 'ai_reference';
}

export async function generateSalesShotAsset(input: {
  prompt: string;
  video: boolean;
  model?: string;
  imageModel?: string;
  referenceImages: string[];
  duration: number;
  isAborted: () => boolean;
}): Promise<string> {
  if (input.video) return submitSalesVideo(input);
  return submitImageGenTask(
    {
      prompt: input.prompt,
      model: input.imageModel || input.model || 'gpt-image-2',
      images: input.referenceImages.slice(0, 1),
    },
    { isAborted: input.isAborted },
  );
}

async function submitSalesVideo(input: {
  prompt: string;
  model?: string;
  referenceImages: string[];
  duration: number;
  isAborted: () => boolean;
}): Promise<string> {
  throwIfGenerationAborted(input.isAborted);
  const { customBaseUrl, customApiKey } = getGatewayClientOverrides();
  const model = input.model || 'doubao-seedance-2.5';
  const duration = clampVideoDuration(model, input.duration);
  const ratios = getVideoModelById(model)?.supportedAspectRatios || ['9:16'];
  const aspectRatio = ratios.includes('9:16') ? '9:16' : ratios[0];
  const res = await apiFetch('/api/generate/video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getGatewayClientHeaders(model),
      ...storageConfigHeaders(),
    },
    body: JSON.stringify({
      prompt: input.prompt,
      model,
      duration,
      aspect_ratio: aspectRatio,
      images: input.referenceImages.slice(0, 1),
      customBaseUrl,
      customApiKey,
      storageConfig: readClientStorageConfig(),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('视频生成响应解析失败');
  if (data.status === 'SUCCESS' && data.resultUrl) return String(data.resultUrl);
  if (!res.ok || data.success === false) {
    throw imageGenBusinessError(data.error || '视频生成提交失败');
  }
  if (!data.taskId) throw new Error('视频网关未返回任务 ID');
  return pollVideoTask(String(data.taskId), input.isAborted);
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
