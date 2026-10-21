import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { classifyGenerationPollResult, imageGenBusinessError, isTransientPollError } from '@client/shared/api/generation/generationErrors';
import { pollGenerationTask, pollSingleTaskResult, submitImageGenTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';
import { withSalesAbort } from './salesAbortSignal';
import { SalesSubmitUncertainError, type SalesVideoLookup } from '../model/salesSubmitError';

export { SalesSubmitUncertainError };
export type { SalesVideoLookup };

function normalizeSalesImageRef(url: string): string {
  const value = url.trim();
  return value.startsWith('//') ? `https:${value}` : value;
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
  const listed = (input.referenceImages || []).map(normalizeSalesImageRef).filter(Boolean);
  const images = listed.length ? listed : (input.referenceImage?.trim() ? [normalizeSalesImageRef(input.referenceImage)] : []);
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
  submissionKey?: string;
  isAborted: () => boolean;
  onTaskId?: (taskId: string) => void;
}): Promise<string> {
  if (input.existingTaskId) return pollVideoTask(input.existingTaskId, input.videoModel, input.isAborted);
  const listed = (input.referenceImages || []).map(normalizeSalesImageRef).filter(Boolean);
  const images = listed.length ? listed : (input.referenceImage ? [normalizeSalesImageRef(input.referenceImage)] : []);
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
    submissionKey: input.submissionKey,
    isAborted: input.isAborted,
    onTaskId: input.onTaskId,
  });
}

export async function lookupSalesVideoSubmission(key: string, model: string | undefined, isAborted: () => boolean): Promise<SalesVideoLookup> {
  assertVideoActive(isAborted);
  let response: Response;
  try {
    response = await withSalesAbort(isAborted, (signal) => apiFetch(`/api/generate/video?taskKey=${encodeURIComponent(key)}${model ? `&model=${encodeURIComponent(model)}` : ''}`, {
      signal,
      headers: { ...getGatewayClientHeaders(model), ...storageConfigHeaders() },
    }));
  } catch (err) {
    if (isAborted()) throw err;
    return { outcome: 'pending', error: '原视频提交记录暂时无法核对，请稍后查询；不会自动重新提交' };
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data) return { outcome: 'pending', error: '原视频提交记录暂时无法核对，请稍后查询；不会自动重新提交' };
  const taskId = typeof data.taskId === 'string' && data.taskId ? data.taskId : undefined;
  const url = typeof data.resultUrl === 'string' && data.resultUrl ? data.resultUrl : undefined;
  const error = typeof data.error === 'string' && data.error ? data.error : typeof data.failReason === 'string' ? data.failReason : undefined;
  if ((data.submissionRejected === true || data.status === 'FAILURE') && !taskId) return { outcome: 'failed', error: error || '视频提交被拒绝' };
  if (typeof error === 'string' && error.includes('尚未找到')) return { outcome: 'missing', error };
  if (!taskId) return { outcome: 'pending', error: error || '原视频提交结果待核实，请查询原任务；不会自动重新提交' };
  if (data.status === 'FAILURE') return { outcome: 'failed', taskId, error: error || '视频生成失败' };
  if (data.status === 'SUCCESS' && url) return { outcome: 'done', taskId, url };
  return { outcome: 'poll', taskId };
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
  submissionKey?: string;
  isAborted: () => boolean;
  onTaskId?: (taskId: string) => void;
}): Promise<string> {
  assertVideoActive(input.isAborted);
  const model = input.model || 'doubao-seedance-2.5';
  for (const image of input.referenceImages) {
    if (!/^(https?:\/\/|\/storage\/)/.test(image)) throw imageGenBusinessError('参考图需要可访问的公网地址或本地存储地址，请重新生成素材后再提交');
  }
  let res: Response;
  try {
    res = await withSalesAbort(input.isAborted, (signal) => apiFetch('/api/generate/video', {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getGatewayClientHeaders(model),
        ...storageConfigHeaders(),
        ...(input.submissionKey ? { 'x-idempotency-key': input.submissionKey } : {}),
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
        ...(input.submissionKey ? { clientTaskId: input.submissionKey } : {}),
        storageConfig: readClientStorageConfig(),
      }),
    }));
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
  return pollVideoTask(taskId, model, input.isAborted);
}

async function pollVideoTask(taskId: string, model: string | undefined, isAborted: () => boolean): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 360000) {
    assertVideoActive(isAborted);
    try { await sleepWhilePolling(2000, isAborted); }
    catch (error) { assertVideoActive(isAborted); throw error; }
    let data: { resultUrl?: unknown; failReason?: unknown; error?: unknown; status?: unknown };
    try {
      data = await pollGenerationTask(taskId, 'video', model);
    } catch (err) {
      assertVideoActive(isAborted);
      if (isTransientPollError(err) || (err instanceof Error && /轮询失败 \((?:408|429|5\d\d)\)/.test(err.message))) continue;
      throw err;
    }
    if (data?.status === 'QUERY_FAILED') continue;
    const outcome = classifyGenerationPollResult(data, { httpOk: true });
    if (outcome === 'success') return String(data.resultUrl);
    if (outcome === 'failure') throw imageGenBusinessError(typeof data.failReason === 'string' ? data.failReason : typeof data.error === 'string' ? data.error : '视频生成失败');
  }
  throw new Error('视频生成超时，请继续查询原任务，不要重新提交');
}

function assertVideoActive(isAborted: () => boolean): void {
  if (isAborted()) throw new DOMException('已停止等待视频结果', 'AbortError');
}
