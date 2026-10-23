import { apiFetch } from '@client/shared/api/apiClient';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { coverDeconstructBody } from '../model/coverReasoning';
import { resolveCoverVisionRoute } from '../model/coverVisionModels';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import {
  CoverMemoryResponseSchema,
  type CoverMemoryResponse,
  type CoverMemoryStatus,
} from '@shared/contracts/coverMemory';

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : '封面记忆请求失败');
  }
  return data;
}

export async function fetchCoverMemory(): Promise<CoverMemoryResponse> {
  return CoverMemoryResponseSchema.parse(await readJson(await apiFetch('/api/generate/headline-memory')));
}

export async function setCoverMemoryStatus(id: string, status: CoverMemoryStatus): Promise<void> {
  await readJson(await apiFetch(`/api/generate/headline-memory/entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }));
}

export async function addCoverCorrection(rule: string): Promise<void> {
  await readJson(await apiFetch('/api/generate/headline-memory/corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule }),
  }));
}

export async function clearCoverTrash(): Promise<void> {
  await readJson(await apiFetch('/api/generate/headline-memory/trash', { method: 'DELETE' }));
}

export class CoverDeconstructError extends Error {
  constructor(message: string, readonly uncertain: boolean) {
    super(message);
  }
}

export async function deconstructCoverSample(imageUrl: string, selectionId: string, title: string, effort?: ReasoningEffort): Promise<{ sampleId: string; model: string }> {
  const route = resolveCoverVisionRoute(selectionId);
  let response: Response;
  try {
    response = await apiFetch('/api/generate/headline-deconstruct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coverDeconstructBody(route, imageUrl, title, effort)),
    });
  } catch (error) {
    throw new CoverDeconstructError(error instanceof Error ? error.message : '反推请求没有完成', true);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const message = typeof data?.error === 'string' ? data.error : '封面反推失败';
    throw new CoverDeconstructError(message, message.includes('请先刷新核对'));
  }
  const sampleId = typeof data.sampleId === 'string' ? data.sampleId : '';
  if (!sampleId) throw new CoverDeconstructError('反推没有保存到封面记忆', true);
  const model = typeof data.model === 'string' ? data.model : route.modelId;
  recordChatTokens({ modelId: model, type: 'vision', usage: data.usage });
  return { sampleId, model };
}
