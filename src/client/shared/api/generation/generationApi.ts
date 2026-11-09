import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getModelCredentials } from '@client/shared/api/gatewayClient';
import { AssetTasksListResponseSchema } from '@shared/contracts/generate';
import type { AssetHistoryTask } from '@client/shared/api/mapDbTask';
import { mapDbTaskToGenerationTask } from '@client/shared/api/mapDbTask';
import { compressImageToDataUrl } from '@client/shared/media/image-utils';
import { readReportedUsage, recordMediaTaskUsage } from '@client/shared/utils/modelUsage';
import { createUsageScope, sameUsageScope, operationUsageScope, type UsageScope } from '@client/shared/utils/usageScope';
import {
  imageGenBusinessError,
  isTransientPollError,
  nonRetryableError,
  classifyGenerationPollResult,
} from '@client/shared/api/generation/generationErrors';
import { generationRecoveryError } from './generationRecovery';
import { isGenerationCancelled, sleepWhilePolling, throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';

/** Billing evidence and confirmed image output are independent, cumulative facts. */
export function recordSharedImageUsage(data: Record<string, unknown>, context: {
  modelId: string; scope: UsageScope; taskId?: string; recordId?: string; localTaskId?: string;
}, httpOk = true): void {
  const complete = httpOk && data.submissionUnknown !== true && data.success !== false && data.status === 'SUCCESS' && typeof data.resultUrl === 'string' && Boolean(data.resultUrl);
  if (!complete && !readReportedUsage(data.usage)) return;
  recordMediaTaskUsage({ ...context, type: 'image',
    taskId: typeof data.taskId === 'string' ? data.taskId : context.taskId,
    recordId: context.recordId || (typeof data.recordId === 'string' ? data.recordId : undefined),
    success: complete, mediaCount: complete ? 1 : 0, billableCount: 1, usage: data.usage,
  });
}

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
  modelId?: string,
  options?: { modelSelection?: string; signal?: AbortSignal; recordId?: string },
) {
  const endpoint = mediaType === 'video' ? '/api/generate/video' : '/api/generate/image';
  const model = modelId ? `&model=${encodeURIComponent(modelId)}` : '';
  const res = await apiFetch(`${endpoint}?taskId=${encodeURIComponent(taskId)}${model}`, {
    ...(options?.signal ? { signal: options.signal } : {}),
    headers: {
      ...storageConfigHeaders(),
      ...getGatewayClientHeaders(options?.modelSelection || modelId),
      ...(options?.recordId ? { 'x-task-record-id': options.recordId } : {}),
    },
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
  modelId?: string,
  routeSnapshot?: Parameters<typeof pollSingleTaskResult>[4],
): Promise<string> {
  const result = await pollSingleTaskResult(taskId, isAborted, isPaused, modelId, routeSnapshot);
  return result.url;
}

export async function pollSingleTaskResult(
  taskId: string,
  isAborted: () => boolean,
  isPaused?: () => boolean,
  modelId?: string,
  routeSnapshot?: { headers: Record<string, string>; modelId?: string; recordId?: string; scope?: UsageScope; localTaskId?: string },
): Promise<{ url: string; temporary: boolean }> {
  const timeoutMs = 360000;
  const start = Date.now();
  const gatewayHeaders = routeSnapshot?.headers || getGatewayClientHeaders(modelId);
  const upstreamModel = routeSnapshot?.modelId || (modelId ? upstreamModalityModelId('image', modelId) : undefined);
  const localUrl = gatewayHeaders['x-custom-base-url'];
  // A bare historical task ID cannot establish a post-clear accounting epoch.
  const usageScope = routeSnapshot?.scope || { ...createUsageScope('image', modelId, gatewayHeaders), epoch: 'initial' };

  while (Date.now() - start < timeoutMs) {
    throwIfGenerationAborted(isAborted);
    await sleepWhilePolling(2000, isAborted, isPaused);
    try {
      const model = upstreamModel ? `&model=${encodeURIComponent(upstreamModel)}` : '';
      const pRes = await apiFetch(`/api/generate/image?taskId=${encodeURIComponent(taskId)}${model}`, {
        headers: {
          ...gatewayHeaders,
          ...(routeSnapshot?.recordId ? { 'x-task-record-id': routeSnapshot.recordId } : {}),
          ...storageConfigHeaders(),
          ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
        },
      });
      const pData = await pRes.json().catch(() => null);

      if (pData) recordSharedImageUsage(pData, { taskId, recordId: routeSnapshot?.recordId, localTaskId: routeSnapshot?.localTaskId, modelId: upstreamModel || modelId || 'gpt-image-2', scope: routeSnapshot?.scope || usageScope }, pRes.ok);
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

export interface ImageSubmissionReceipt { recordId?: string; scope: UsageScope }

export interface SubmitImageGenTaskDeps {
  onUsagePrepared?: (scope: UsageScope) => void | Promise<void>;
  onReceipt?: (receipt: ImageSubmissionReceipt) => void | Promise<void>;
  isAborted: () => boolean;
  isPaused?: () => boolean;
  idempotencyKey?: string;
  modelSelection?: string;
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
  const modelId = typeof payload.model === 'string' ? payload.model : undefined;
  const selection = deps.modelSelection || modelId;
  const modelCreds = getModelCredentials(selection);
  const gatewayHeaders = getGatewayClientHeaders(selection);
  const usageScope = operationUsageScope(deps.idempotencyKey, 'image', selection, gatewayHeaders);

  const finalPayload: Record<string, unknown> = {
    ...payload,
    ...(modelId ? { model: upstreamModalityModelId('image', modelId) } : {}),
    customBaseUrl: gatewayHeaders['x-custom-base-url'],
    customApiKey: gatewayHeaders['x-custom-api-key'],
    storageConfig: readClientStorageConfig(),
  };
  if ((modelCreds.protocol === 'dashscope' || modelCreds.protocol === 'template') && finalPayload.customProtocol == null) {
    finalPayload.customProtocol = modelCreds.protocol;
  }
  if (modelCreds.protocol === 'template' && modelCreds.requestTemplate && finalPayload.requestTemplate == null) {
    finalPayload.requestTemplate = modelCreds.requestTemplate;
  }

  if (!sameUsageScope(usageScope, createUsageScope('image', selection, gatewayHeaders))) throw generationRecoveryError('原操作渠道已变更，请恢复原渠道后核对；本次未提交模型');
  await deps.onUsagePrepared?.(usageScope);
  const submit = async () => {
    try {
      return await apiFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...gatewayHeaders,
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
  recordSharedImageUsage(data, { localTaskId: deps.idempotencyKey, scope: usageScope, modelId: String(data.model || payload.model || 'gpt-image-2') }, res.ok);
  try { await deps.onReceipt?.({ recordId: typeof data.recordId === 'string' ? data.recordId : undefined, scope: usageScope }); }
  catch (error) { throw generationRecoveryError(`原任务回执保存未确认：${error instanceof Error ? error.message : '保存失败'}，请核对原任务`); }

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


  if (data.status === 'SUCCESS' && data.resultUrl) {
    return { url: String(data.resultUrl), temporary: Boolean(data.temporaryUrl) };
  }

  if (data.taskId) {
    try {
      throwIfGenerationAborted(deps.isAborted);
      return await pollSingleTaskResult(data.taskId, deps.isAborted, deps.isPaused, selection, { headers: gatewayHeaders, modelId: typeof finalPayload.model === 'string' ? finalPayload.model : undefined, recordId: typeof data.recordId === 'string' ? data.recordId : undefined, scope: usageScope, localTaskId: deps.idempotencyKey });
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
