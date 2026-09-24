import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@/shared/api/gatewayClient';
import { AssetTasksListResponseSchema } from '@beike/contracts/generate';
import type { GenerationTask } from '@/store/appStoreTypes';
import { mapDbTaskToGenerationTask } from '@/shared/api/mapDbTask';
import { compressImageToDataUrl } from '@/shared/media/image-utils';
import { recordModelUsage, resolveModelVendor } from '@/shared/utils/usageTracker';
import {
  imageGenBusinessError,
  isTransientPollError,
  nonRetryableError,
  classifyGenerationPollResult,
} from '@/shared/api/generationErrors';
import { sleepWhilePolling, throwIfGenerationAborted } from '@/shared/api/generationAbort';

export async function fetchAssetTasks(page = 1, pageSize = 40): Promise<{
  tasks: GenerationTask[];
  total: number;
}> {
  const res = await apiFetch(`/api/assets/tasks?page=${page}&pageSize=${pageSize}&detail=true`);
  if (!res.ok) {
    throw new Error(`资产任务列表请求失败 (${res.status})`);
  }
  const json = await res.json();
  const parsed = AssetTasksListResponseSchema.safeParse(json);
  const rawTasks = parsed.success
    ? (parsed.data.tasks || parsed.data.items || [])
    : (json.tasks || json.items || []);

  const tasks = (rawTasks as Record<string, unknown>[]).map(mapDbTaskToGenerationTask);

  return {
    tasks,
    total: parsed.success ? (parsed.data.total ?? tasks.length) : tasks.length,
  };
}

export async function pollGenerationTask(
  taskId: string,
  mediaType: 'image' | 'video' = 'image',
) {
  const endpoint = mediaType === 'video' ? '/api/generate/video' : '/api/generate/image';
  const res = await apiFetch(`${endpoint}?taskId=${encodeURIComponent(taskId)}`, {
    headers: storageConfigHeaders(),
  });
  if (!res.ok) {
    throw new Error(`轮询失败 (${res.status})`);
  }
  return res.json();
}

export async function compressProductImageIfNeeded(img: string): Promise<string> {
  if (typeof img === 'string' && img.startsWith('data:') && img.length > 1_200_000) {
    try {
      return await compressImageToDataUrl(img, 1400, 0.82);
    } catch (compErr) {
      console.warn('[compressProductImageIfNeeded] 垫图压缩失败，回退原图:', compErr);
    }
  }
  return img;
}

export async function pollSingleTask(
  taskId: string,
  isAborted: () => boolean,
  isPaused?: () => boolean,
): Promise<string> {
  const result = await pollSingleTaskResult(taskId, isAborted, isPaused);
  return result.url;
}

export async function pollSingleTaskResult(
  taskId: string,
  isAborted: () => boolean,
  isPaused?: () => boolean,
): Promise<{ url: string; temporary: boolean }> {
  const timeoutMs = 360000;
  const start = Date.now();
  const gatewayHeaders = getGatewayClientHeaders();
  const localUrl = gatewayHeaders['x-custom-base-url'];

  while (Date.now() - start < timeoutMs) {
    throwIfGenerationAborted(isAborted);
    await sleepWhilePolling(2000, isAborted, isPaused);
    try {
      const pRes = await apiFetch(`/api/generate/image?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
          ...gatewayHeaders,
          ...storageConfigHeaders(),
          ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
        },
      });
      const pData = await pRes.json().catch(() => null);

      if (!pData) {
        continue;
      }

      if (pRes.status >= 500 || pData.status === 'QUERY_FAILED') {
        continue;
      }

      const outcome = classifyGenerationPollResult(pData, { httpOk: pRes.ok });
      if (outcome === 'success') {
        return { url: String(pData.resultUrl), temporary: Boolean(pData.temporaryUrl) };
      }
      if (outcome === 'failure') {
        throw imageGenBusinessError(pData.failReason || pData.error || '生图任务失败');
      }
    } catch (e: unknown) {
      throwIfGenerationAborted(isAborted);
      if (!isTransientPollError(e)) throw e;
    }
  }
  throwIfGenerationAborted(isAborted);
  throw nonRetryableError(`生图超时（已等待 6 分钟，任务 ${taskId}）`);
}

export interface SubmitImageGenTaskDeps {
  isAborted: () => boolean;
  isPaused?: () => boolean;
  idempotencyKey?: string;
  onTaskSubmitted?: (taskId: string) => void;
}

const LOCAL_API_RETRY_DELAYS_MS = [800, 1600, 2600] as const;

async function isLocalApiUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 502) return false;
  const data = await response.clone().json().catch(() => null);
  return typeof data?.error === 'string' && /本地后台服务未连接/.test(data.error);
}

export async function submitImageGenTask(
  payload: Record<string, unknown>,
  deps: SubmitImageGenTaskDeps
): Promise<string> {
  const result = await submitImageGenTaskResult(payload, deps);
  return result.url;
}

export async function submitImageGenTaskResult(
  payload: Record<string, unknown>,
  deps: SubmitImageGenTaskDeps
): Promise<{ url: string; temporary: boolean }> {
  throwIfGenerationAborted(deps.isAborted);
  const { customBaseUrl: localUrl, customApiKey: localApiKey } = getGatewayClientOverrides();

  const finalPayload = {
    ...payload,
    customBaseUrl: localUrl,
    customApiKey: localApiKey,
    storageConfig: readClientStorageConfig(),
  };

  const submit = () => apiFetch('/api/generate/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getGatewayClientHeaders(),
      ...storageConfigHeaders(),
      ...(deps.idempotencyKey ? { 'x-idempotency-key': deps.idempotencyKey } : {}),
    },
    body: JSON.stringify(finalPayload),
  });

  let res = await submit();
  for (const delayMs of LOCAL_API_RETRY_DELAYS_MS) {
    throwIfGenerationAborted(deps.isAborted);
    if (!(await isLocalApiUnavailable(res))) break;
    await sleepWhilePolling(delayMs, deps.isAborted, deps.isPaused);
    res = await submit();
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    throw nonRetryableError(payload.isGrid2x2 ? '四宫格生图响应解析失败' : '生图响应解析失败');
  }
  if (!res.ok || !data.success) {
    throw nonRetryableError(
      data.error || (payload.isGrid2x2 ? '四宫格生图提交失败' : '生图任务提交失败')
    );
  }

  try {
    const resolvedModelId = data.model || payload.model || 'gpt-image-2';
    recordModelUsage({
      modelId: String(resolvedModelId),
      modelName: String(resolvedModelId),
      provider: resolveModelVendor(String(resolvedModelId)),
      type: 'image',
      mediaCount: 1,
      success: true,
    });
  } catch {}

  if (data.status === 'SUCCESS' && data.resultUrl) {
    return { url: String(data.resultUrl), temporary: Boolean(data.temporaryUrl) };
  }

  if (data.taskId) {
    deps.onTaskSubmitted?.(String(data.taskId));
    throwIfGenerationAborted(deps.isAborted);
    return await pollSingleTaskResult(data.taskId, deps.isAborted, deps.isPaused);
  }

  throw nonRetryableError(
    payload.isGrid2x2 ? '四宫格生图网关未返回有效任务 ID' : '生图网关未返回有效任务 ID'
  );
}
