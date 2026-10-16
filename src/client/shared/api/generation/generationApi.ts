import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { AssetTasksListResponseSchema } from '@shared/contracts/generate';
import type { AssetHistoryTask } from '@client/shared/api/mapDbTask';
import { mapDbTaskToGenerationTask } from '@client/shared/api/mapDbTask';
import { compressImageToDataUrl } from '@client/shared/media/image-utils';
import { recordModelUsage, resolveModelVendor } from '@client/shared/utils/usageTracker';
import {
  imageGenBusinessError,
  isTransientPollError,
  nonRetryableError,
  classifyGenerationPollResult,
} from '@client/shared/api/generation/generationErrors';
import { generationRecoveryError } from './generationRecovery';
import { isGenerationCancelled, sleepWhilePolling, throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';

export async function fetchAssetTasks(page = 1, pageSize = 40, signal?: AbortSignal): Promise<{
  tasks: AssetHistoryTask[];
  total: number;
}> {
  const res = await apiFetch(`/api/assets/tasks?page=${page}&pageSize=${pageSize}&detail=true`, { signal });
  if (!res.ok) {
    throw new Error(`资产任务列表请求失败 (${res.status})`);
  }
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || '资产任务列表加载失败');
  const parsed = AssetTasksListResponseSchema.safeParse(json);
  const rawTasks = parsed.success
    ? (parsed.data.tasks || parsed.data.items || [])
    : (json.tasks || json.items || []);

  const tasks = (rawTasks as Record<string, unknown>[]).map(mapDbTaskToGenerationTask);

  return {
    tasks,
    total: parsed.success ? (parsed.data.total ?? tasks.length) : (typeof json.total === 'number' ? json.total : tasks.length),
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

      if (!pRes.ok) throw generationRecoveryError(pData.error || '原任务暂时无法查询');
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
  throw generationRecoveryError(`等待结果超时（任务 ${taskId}），请核对原任务，不要重复提交`);
}

export interface SubmitImageGenTaskDeps {
  isAborted: () => boolean;
  isPaused?: () => boolean;
  idempotencyKey?: string;
  onTaskSubmitted?: (taskId: string) => void | Promise<void>;
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

  const submit = async () => {
    try {
      return await apiFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getGatewayClientHeaders(typeof payload.model === 'string' ? payload.model : undefined),
          ...storageConfigHeaders(),
          ...(deps.idempotencyKey ? { 'x-idempotency-key': deps.idempotencyKey } : {}),
        },
        body: JSON.stringify(finalPayload),
      });
    } catch (error) {
      throw generationRecoveryError(`提交结果未确认：${error instanceof Error ? error.message : '网络异常'}，请先核对原任务`);
    }
  };

  let res = await submit();
  for (const delayMs of LOCAL_API_RETRY_DELAYS_MS) {
    if (!(await isLocalApiUnavailable(res))) break;
    throwIfGenerationAborted(deps.isAborted);
    await sleepWhilePolling(delayMs, deps.isAborted, deps.isPaused);
    res = await submit();
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    throw generationRecoveryError('生图响应解析失败，提交结果待核对');
  }
  // Even a persistence-error response can carry a valid upstream task id.
  if (data.taskId) {
    try { await deps.onTaskSubmitted?.(String(data.taskId)); }
    catch (error) { throw generationRecoveryError(`已获得上游任务 ${data.taskId}，但本地保存未确认：${error instanceof Error ? error.message : '保存失败'}，请核对原任务`); }
  }
  if (!res.ok || !data.success) {
    const errorFactory = data.submissionUnknown || data.taskId || res.status >= 500 || res.status === 408
      ? generationRecoveryError : nonRetryableError;
    throw errorFactory(
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
    try {
      throwIfGenerationAborted(deps.isAborted);
      return await pollSingleTaskResult(data.taskId, deps.isAborted, deps.isPaused);
    } catch (error) {
      // Cancellation stops waiting, not the upstream generation or its billing.
      if (error instanceof Error && error.name === 'ImageGenBusinessError' && !isGenerationCancelled(error)) throw error;
      throw generationRecoveryError(error instanceof Error ? error.message : '原任务结果待核对');
    }
  }

  throw generationRecoveryError(
    payload.isGrid2x2 ? '四宫格生图网关未返回有效任务 ID' : '生图网关未返回有效任务 ID'
  );
}
