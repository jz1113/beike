import { apiRequest } from '@client/shared/api/apiRequest';
import { readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides, getModelCredentials } from '@client/shared/api/gatewayClient';
import { salesAssetViewJobResponseSchema, salesAssetViewJobsResponseSchema, type SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { AssetViewRequest } from '../model/salesAssetViews';
import { gridImageSettings } from './salesAssetViews';

async function readResult(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '后台视角任务暂不可用，请重试';
    if (response.status === 404 && message === '接口不存在') throw new Error('当前后台服务尚未加载九宫格任务，请重启贝壳服务后刷新。');
    throw new Error(message);
  }
  return data;
}

export async function submitSalesAssetJob(kind: 'persona' | 'scene', request: AssetViewRequest, data: Record<string, unknown>, assetId?: string, signal?: AbortSignal): Promise<SalesAssetViewJob> {
  const credentials = getModelCredentials(request.model);
  const overrides = getGatewayClientOverrides();
  const { maxReferenceImages, ...settings } = gridImageSettings(kind, request.model);
  const references = maxReferenceImages ? request.references.slice(0, maxReferenceImages) : request.references;
  const response = await apiRequest('POST', '/api/sales/asset-view-jobs', {
    signal, headers: { 'Content-Type': 'application/json', ...getGatewayClientHeaders(request.model), ...storageConfigHeaders() },
    body: JSON.stringify({ key: request.key, kind, assetId: request.assetId || assetId, data,
      checkpoint: { taskId: request.taskId, resultUrl: request.resultUrl },
      generation: {
        model: upstreamModalityModelId('image', request.model), modelSelection: request.model, ...settings, useReferenceImage: true,
        referenceImageUrl: references[0], referenceImages: references,
        customBaseUrl: credentials.baseUrl || overrides.customBaseUrl,
        customApiKey: credentials.apiKey || overrides.customApiKey,
        customProtocol: credentials.protocol, requestTemplate: credentials.requestTemplate,
        storageConfig: readClientStorageConfig(), source: `sales_${kind}_view`,
      },
    }),
  });
  const parsed = salesAssetViewJobResponseSchema.safeParse(await readResult(response));
  if (!parsed.success) throw new Error('后台任务回执不完整，请保留草稿并重试核对原任务');
  request.jobId = parsed.data.job.id;
  request.assetId = parsed.data.job.assetId;
  return parsed.data.job;
}

export async function listSalesAssetJobs(signal?: AbortSignal): Promise<SalesAssetViewJob[]> {
  const response = await apiRequest('GET', '/api/sales/asset-view-jobs', { signal, cache: 'no-store' });
  const parsed = salesAssetViewJobsResponseSchema.safeParse(await readResult(response));
  if (!parsed.success) throw new Error('后台任务列表不完整，请刷新重试');
  return parsed.data.jobs;
}
