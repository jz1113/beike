import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides, getModelCredentials } from '@client/shared/api/gatewayClient';
import { pollSingleTaskResult } from '@client/shared/api/generation/generationApi';
import { throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';
import { mapWithLimit, SALES_IMAGE_BATCH_LIMIT, salesReferenceRejection } from '../model/salesAssetHelpers';
import type { SalesImageBatchClient, SalesImageBatchItem, SalesImageBatchReceipt } from '../model/salesImageTypes';

export { mapWithLimit, SALES_IMAGE_BATCH_LIMIT };
export type { SalesImageBatchClient, SalesImageBatchItem, SalesImageBatchReceipt } from '../model/salesImageTypes';

function normalizeSalesImageRef(url: string): string {
  const value = url.trim();
  return value.startsWith('//') ? `https:${value}` : value;
}

function batchItemPayload(item: SalesImageBatchItem): Record<string, unknown> {
  const images = (item.referenceImages || []).map(normalizeSalesImageRef).filter(Boolean);
  const { customBaseUrl, customApiKey } = getGatewayClientOverrides();
  const modelCreds = getModelCredentials(item.imageModel);
  const payload: Record<string, unknown> = {
    id: item.id,
    idempotencyKey: item.idempotencyKey,
    prompt: item.prompt,
    model: item.imageModel,
    aspectRatio: item.aspectRatio || '9:16',
    customBaseUrl,
    customApiKey,
    storageConfig: readClientStorageConfig(),
    ...(images.length ? { useReferenceImage: true, referenceImageUrl: images[0], referenceImages: images, images } : {}),
  };
  if ((modelCreds.protocol === 'dashscope' || modelCreds.protocol === 'template') && payload.customProtocol == null) {
    payload.customProtocol = modelCreds.protocol;
  }
  if (modelCreds.protocol === 'template' && modelCreds.requestTemplate != null && payload.requestTemplate == null) {
    payload.requestTemplate = modelCreds.requestTemplate;
  }
  return payload;
}

function classifyBatchItem(raw: unknown, fallbackId: string): SalesImageBatchReceipt {
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const id = typeof item.id === 'string' && item.id ? item.id : fallbackId;
  const taskId = typeof item.taskId === 'string' && item.taskId ? item.taskId : undefined;
  const url = typeof item.resultUrl === 'string' && item.resultUrl ? item.resultUrl : undefined;
  const error = typeof item.error === 'string' && item.error ? item.error : undefined;
  if (item.success === true && item.status === 'SUCCESS' && url) return { id, taskId, url, outcome: 'done' };
  if (item.success === true && taskId) return { id, taskId, outcome: 'poll' };
  if (item.submissionRejected === true || item.submissionOutcome === 'rejected' || (salesReferenceRejection(error) && !taskId)) {
    return { id, taskId, error: error || '生图提交被拒绝', outcome: 'failed' };
  }
  return { id, taskId, error: error || '图片结果未确认', outcome: 'uncertain' };
}

export async function submitSalesImageBatch(items: SalesImageBatchItem[], isAborted: () => boolean): Promise<SalesImageBatchReceipt[]> {
  throwIfGenerationAborted(isAborted);
  if (!items.length) return [];
  if (items.length > SALES_IMAGE_BATCH_LIMIT) throw new Error('一批最多提交 20 张图片');
  let response: Response;
  try {
    response = await apiFetch('/api/generate/image-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getGatewayClientHeaders(items[0]?.imageModel),
        ...storageConfigHeaders(),
      },
      body: JSON.stringify({ items: items.map(batchItemPayload) }),
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '批量生图请求失败');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success || !Array.isArray(data.items)) {
    throw new Error(typeof data?.error === 'string' ? data.error : '批量生图请求失败');
  }
  return items.map((item, index) => ({ ...classifyBatchItem(data.items[index], item.id), id: item.id }));
}

export async function lookupSalesImageSubmission(key: string, imageModel: string | undefined, isAborted: () => boolean): Promise<SalesImageBatchReceipt> {
  throwIfGenerationAborted(isAborted);
  let response: Response;
  try {
    response = await apiFetch(`/api/generate/image?taskKey=${encodeURIComponent(key)}`, {
      headers: { ...getGatewayClientHeaders(imageModel), ...storageConfigHeaders() },
    });
  } catch (error) {
    return { id: '', outcome: 'uncertain', error: error instanceof Error ? error.message : '原任务提交记录暂时无法核对' };
  }
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return { id: '', outcome: 'uncertain', error: '原任务提交记录暂时无法核对' };
  const record = data as Record<string, unknown>;
  const taskId = typeof record.taskId === 'string' && record.taskId ? record.taskId : undefined;
  const url = typeof record.resultUrl === 'string' && record.resultUrl ? record.resultUrl : undefined;
  const error = typeof record.failReason === 'string' && record.failReason ? record.failReason
    : typeof record.error === 'string' && record.error ? record.error : undefined;
  if (record.status === 'QUERY_FAILED' || record.submissionPending === true) {
    return { id: '', taskId, outcome: 'uncertain', error: error || '提交结果未确认' };
  }
  if (record.status === 'FAILURE') return { id: '', taskId, outcome: 'failed', error: error || '生图任务失败' };
  if (record.status === 'SUCCESS' && url) return { id: '', taskId, url, outcome: 'done' };
  if (taskId) return { id: '', taskId, outcome: 'poll' };
  return { id: '', outcome: 'uncertain', error: error || '提交结果未确认' };
}

export async function pollSalesImageTask(taskId: string, imageModel: string | undefined, isAborted: () => boolean): Promise<string> {
  return (await pollSingleTaskResult(taskId, isAborted, undefined, imageModel)).url;
}

export const defaultSalesImageBatchClient: SalesImageBatchClient = {
  submitBatch: submitSalesImageBatch,
  poll: (input) => pollSalesImageTask(input.taskId, input.imageModel, input.isAborted),
  lookup: lookupSalesImageSubmission,
};
