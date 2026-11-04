import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { assetCreationDimensions, readSalesAssetCreation } from '../model/salesAssetCreation';
import { apiRequest } from '@client/shared/api/apiRequest';
import { readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides, getModelCredentials, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { salesAssetViewJobResponseSchema, salesAssetViewJobsResponseSchema, type SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import type { AssetViewRequest } from '../model/salesAssetViews';
import { gridImageSettings } from './salesAssetViews';

async function readResult(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '后台视角任务暂不可用，请重试';
    if (response.status === 404 && message === '接口不存在') throw new Error('当前后台服务尚未加载视角图任务，请重启贝壳服务后刷新。');
    throw new Error(message);
  }
  return data;
}

export async function submitSalesAssetJob(kind: 'persona' | 'scene', request: AssetViewRequest, data: Record<string, unknown>, assetId?: string, signal?: AbortSignal): Promise<SalesAssetViewJob> {
  const credentials = getModelCredentials(request.model);
  const overrides = getGatewayClientOverrides();
  const { maxReferenceImages, ...settings } = gridImageSettings(kind, request.model);
  const references = maxReferenceImages ? request.references.slice(0, maxReferenceImages) : request.references;
  // A directly imported persona also needs a description before its first set of views.
  const dimensions = typeof data.dimensions === 'string' ? data.dimensions : undefined;
  if (kind === 'persona' && references[0] && !request.creation && !request.jobId && !request.taskId && !request.resultUrl && !readSalesAssetCreation(dimensions)?.prompt) {
    const analysisModel = loadSystemConfiguredModels().selectedVisionModel;
    if (!analysisModel) throw new Error('请先在设置中配置图像理解模型');
    request.analysisModel = analysisModel;
    request.creation = { referenceImageUrl: references[0] };
    data = { ...data, dimensions: assetCreationDimensions(dimensions, request.creation) };
  }
  const creation = request.creation && request.analysisModel ? {
    referenceImageUrl: request.creation.referenceImageUrl,
    analysisModel: selectedTextModel(request.analysisModel).modelId,
    analysisModelSelection: request.analysisModel,
    ...getMultimodalClientOverrides(request.analysisModel),
  } : undefined;
  const response = await apiRequest('POST', '/api/sales/asset-view-jobs', {
    signal, headers: { 'Content-Type': 'application/json', ...getGatewayClientHeaders(request.model), ...storageConfigHeaders() },
    body: JSON.stringify({ key: request.key, kind, assetId: request.assetId || assetId, data,
      checkpoint: { taskId: request.taskId, resultUrl: request.resultUrl },
      generation: {
        model: upstreamModalityModelId('image', request.model), modelSelection: request.model, layout: request.layout, ...settings, useReferenceImage: true,
        referenceImageUrl: references[0], referenceImages: references,
        customBaseUrl: credentials.baseUrl || overrides.customBaseUrl,
        customApiKey: credentials.apiKey || overrides.customApiKey,
        customProtocol: credentials.protocol, requestTemplate: credentials.requestTemplate,
        storageConfig: readClientStorageConfig(), source: `sales_${kind}_view`,
        ...(creation ? { assetCreation: creation } : {}),
      },
    }),
  });
  const parsed = salesAssetViewJobResponseSchema.safeParse(await readResult(response));
  if (!parsed.success) throw new Error('后台任务回执不完整，请保留草稿并重试核对原任务');
  request.jobId = parsed.data.job.id;
  request.assetId = parsed.data.job.assetId;
  if (parsed.data.job.creation) request.creation = parsed.data.job.creation;
  return parsed.data.job;
}

export async function readSalesAssetJob(id: string, signal?: AbortSignal): Promise<SalesAssetViewJob> {
  const response = await apiRequest('GET', '/api/sales/asset-view-jobs', { search: `jobId=${encodeURIComponent(id)}`, signal, cache: 'no-store' });
  const parsed = salesAssetViewJobResponseSchema.safeParse(await readResult(response));
  if (!parsed.success) throw new Error('生成结果不完整，请重试读取');
  return parsed.data.job;
}

export async function waitSalesAssetJob(initial: SalesAssetViewJob, signal: AbortSignal, onProgress: (job: SalesAssetViewJob) => void): Promise<SalesAssetViewJob> {
  let job = initial;
  while (true) {
    signal.throwIfAborted();
    onProgress(job);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(finish, 2000);
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
    });
    job = await readSalesAssetJob(job.id, signal);
  }
}

export async function listSalesAssetJobs(signal?: AbortSignal): Promise<SalesAssetViewJob[]> {
  const response = await apiRequest('GET', '/api/sales/asset-view-jobs', { signal, cache: 'no-store' });
  const parsed = salesAssetViewJobsResponseSchema.safeParse(await readResult(response));
  if (!parsed.success) throw new Error('后台任务列表不完整，请刷新重试');
  return parsed.data.jobs;
}
