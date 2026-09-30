import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { retryWhenLocalApiUnavailable } from '@client/shared/api/localApiRetry';
import { pollSingleTask, submitImageGenTask } from '@client/shared/api/generationApi';
import { generationRecoveryError } from '@client/shared/api/generationRecovery';
import { classifyGenerationPollResult, imageGenBusinessError } from '@client/shared/api/generationErrors';
import type { ReservedArtDirection } from '../model/reservedArtDirections';
import { exportCoverJpeg, loadImageForCanvas } from '../model/coverExport';
import {
  normalizeCoverTitle,
  type CoverDesignPlan,
  type HeadlineDesignResponse,
  type HeadlineTitleResponse,
  type ImageQuality,
  type PosterItem,
} from '../model/posterTypes';
import type { CoverFormat } from '../model/coverFormat';

/** Stop renderer waiting promptly while the durable upstream task keeps its original operation key. */
function waitForPosterOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('已取消大字报任务', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function rewriteCoverTitle(item: PosterItem, titleModel: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await retryWhenLocalApiUnavailable(() => apiFetch('/api/generate/headline-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: titleModel,
        originalTitle: item.originalTitle,
        productName: item.productName,
        imageUrls: [item.sourceImageUrl],
      }),
      signal,
    }), { signal });
    const data = await response.json().catch(() => ({}));
    const title = normalizeCoverTitle((data?.data as HeadlineTitleResponse | undefined)?.title || '');
    if (data?.success && title.length >= 7 && title.length <= 12) return title;
    throw new Error(data?.error || '标题改写模型没有返回 7–12 字的有效标题');
  } catch (error) {
    throw new Error(`标题改写阶段失败，已停止后续封面设计和生图：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function directCoverDesign(
  item: PosterItem,
  coverTitle: string,
  artDirection: ReservedArtDirection,
  titleModel: string,
  signal?: AbortSignal,
): Promise<HeadlineDesignResponse> {
  try {
    const response = await retryWhenLocalApiUnavailable(() => apiFetch('/api/generate/headline-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: titleModel,
        originalTitle: item.originalTitle,
        coverTitle,
        productName: item.productName,
        aspectRatio: item.format.aspectRatio,
        reservedArtDirection: artDirection,
        imageUrls: [item.sourceImageUrl],
      }),
      signal,
    }), { signal });
    const data = await response.json().catch(() => ({}));
    if (data?.success && data?.data && typeof data.data === 'object') return data.data as HeadlineDesignResponse;
    throw new Error(data?.error || '封面设计模型没有返回可用方案');
  } catch (error) {
    throw new Error(`封面设计阶段失败，已停止后续生图：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function generateFinalCover(
  productReferenceUrl: string,
  originalTitle: string,
  coverTitle: string,
  productName: string,
  format: CoverFormat,
  plan: CoverDesignPlan | undefined,
  prompt: string | undefined,
  imageModel: string,
  imageQuality: ImageQuality,
  isAborted: () => boolean = () => false,
  recovery: {
    taskId?: string;
    submissionKey?: string;
    sceneUrl?: string;
    required?: boolean;
    signal?: AbortSignal;
    onTaskSubmitted?: (taskId: string) => void;
    onSceneGenerated?: (url: string) => void;
  } = {},
): Promise<string> {
  if (isAborted()) throw new Error('已取消大字报任务');
  let generatedSceneUrl = recovery.sceneUrl;
  let taskId = recovery.taskId;
  if (!generatedSceneUrl && !taskId && recovery.required) {
    if (!recovery.submissionKey) throw generationRecoveryError('旧任务缺少查询标识，请在资产中心核对原任务；不会重新提交生图');
    const response = await apiFetch(`/api/generate/image?taskKey=${encodeURIComponent(recovery.submissionKey)}`, { headers: storageConfigHeaders(), signal: recovery.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.taskId) throw generationRecoveryError(data?.error || '尚未查到原任务，请稍后核对；不会重新提交生图');
    taskId = String(data.taskId);
    recovery.onTaskSubmitted?.(taskId);
    const outcome = classifyGenerationPollResult(data, { httpOk: response.ok });
    if (outcome === 'failure') throw imageGenBusinessError(data.failReason || data.error || '原生图任务失败');
    if (outcome === 'success') generatedSceneUrl = String(data.resultUrl);
  }
  if (isAborted()) throw new Error('已取消大字报任务');
  if (!generatedSceneUrl && taskId) generatedSceneUrl = await waitForPosterOperation(pollSingleTask(taskId, isAborted), recovery.signal);
  if (!generatedSceneUrl) {
    if (!plan || !prompt) throw new Error('封面设计记录缺失，已停止本次生图；请重新进行标题与封面设计');
    generatedSceneUrl = await waitForPosterOperation(submitImageGenTask({
    model: imageModel,
    aspectRatio: format.aspectRatio,
    size: format.id === 'square' ? '1440x1440' : undefined,
    quality: imageQuality,
    source: 'headline_poster_direct_final',
    useReferenceImage: true,
    referenceImageUrl: productReferenceUrl,
    referenceImages: [productReferenceUrl],
    prompt,
    metadata: {
      workflow: 'headline_poster_direct_final',
      designName: plan.name,
      titleLines: plan.titleLines,
      outputFormat: format.importValue,
      outputSize: format.width + 'x' + format.height,
      originalTitle,
      coverTitle,
      productName,
      promptVersion: 'integrated-cover-v4',
    },
  }, { isAborted, idempotencyKey: recovery.submissionKey, onTaskSubmitted: (id) => {
    if (!recovery.signal?.aborted) recovery.onTaskSubmitted?.(id);
  } }), recovery.signal);
  }
  recovery.onSceneGenerated?.(generatedSceneUrl);
  if (isAborted()) throw new Error('已取消大字报任务');
  const loading = loadImageForCanvas(generatedSceneUrl).then((result) => {
    if (recovery.signal?.aborted) {
      result.revoke();
      throw recovery.signal.reason;
    }
    return result;
  });
  const { image, revoke } = await waitForPosterOperation(loading, recovery.signal);
  const canvas = document.createElement('canvas');
  try {
    if (isAborted()) throw new Error('已取消大字报任务');
    const expectedRatio = format.width / format.height;
    if (!image.naturalWidth || !image.naturalHeight || Math.abs(image.naturalWidth / image.naturalHeight - expectedRatio) > 0.02) {
      throw new Error('生图结果不是 ' + format.aspectRatio + '，已停止导出以避免拉伸或裁掉标题');
    }
    canvas.width = format.width;
    canvas.height = format.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法导出封面');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await waitForPosterOperation(exportCoverJpeg(canvas, format), recovery.signal);
    if (isAborted()) throw new Error('已取消大字报任务');
    return URL.createObjectURL(blob);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    revoke();
  }
}
