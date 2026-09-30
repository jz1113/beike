import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { readEffectiveFallbackOrder } from '@client/shared/api/fallbackOrder';
import { isOpenAIModelRouteId, requestModelId } from '@shared/domain/models/workflowModels';
import { isDeepSeekRoute } from '@shared/domain/models/deepseek';
import type { DeconstructJobSnapshot } from '@shared/contracts/deconstructJobs';

const endpoint = '/api/catalog/assets/deconstruct/jobs';

export class DeconstructJobRequestError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new DeconstructJobRequestError('任务服务返回内容未确认，请核对原任务状态');
  if (!response.ok || body.success === false) {
    throw new DeconstructJobRequestError(body.error || `任务服务暂不可用（${response.status}）`, response.status);
  }
  if (body.success !== true) throw new DeconstructJobRequestError('任务响应未确认，请核对原任务状态');
  return body;
}

function snapshot(value: unknown): DeconstructJobSnapshot {
  const statuses = ['queued', 'running', 'stopping', 'completed', 'failed', 'stopped', 'interrupted'];
  if (!value || typeof value !== 'object' || !('jobId' in value) || typeof value.jobId !== 'string'
    || !('items' in value) || !Array.isArray(value.items) || !('status' in value) || !statuses.includes(String(value.status))
    || !('createdAt' in value) || typeof value.createdAt !== 'string' || !('updatedAt' in value) || typeof value.updatedAt !== 'string'
    || value.items.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.images))) {
    throw new DeconstructJobRequestError('任务响应缺少状态，请核对原任务状态');
  }
  return value as DeconstructJobSnapshot;
}

export async function listDeconstructJobs(): Promise<DeconstructJobSnapshot[]> {
  const body = await readResponse(await apiFetch(endpoint));
  if (!Array.isArray(body.jobs)) throw new DeconstructJobRequestError('任务列表未确认，稍后重试查询');
  return body.jobs.map(snapshot);
}

export async function readDeconstructJob(jobId: string): Promise<DeconstructJobSnapshot> {
  const body = await readResponse(await apiFetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`));
  return snapshot(body.job);
}

export async function submitDeconstructJob(input: {
  jobId: string;
  items: Array<{ id: string; name: string; images: string[]; targetCategory?: string; targetSubcategory?: string; customSubCategories?: unknown[] }>;
  userHint: string;
  selectedVisionModel: string;
  modelIds: string[];
  concurrency: number;
  reviewBeforeSave?: boolean;
}): Promise<DeconstructJobSnapshot> {
  const { selectedVisionModel, modelIds, ...rest } = input;
  const overrides = getMultimodalClientOverrides(selectedVisionModel);
  const isolatedRoute = isOpenAIModelRouteId(selectedVisionModel) || isDeepSeekRoute(selectedVisionModel);
  // Submission is never replayed automatically. An unknown response is recovered
  // with this same persisted jobId, so one user action cannot bill twice.
  const body = await readResponse(await apiFetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rest, reviewBeforeSave: Boolean(rest.reviewBeforeSave), model: requestModelId(selectedVisionModel), overrides,
      fallbackOrder: isolatedRoute ? [] : (readEffectiveFallbackOrder() || modelIds).filter(id => !isOpenAIModelRouteId(id) && !isDeepSeekRoute(id)).map(requestModelId) }),
  }));
  return snapshot(body.job);
}

export async function stopDeconstructJob(jobId: string): Promise<DeconstructJobSnapshot> {
  const body = await readResponse(await apiFetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop', jobId }),
  }));
  return snapshot(body.job);
}
