import { apiFetch } from '@client/shared/api/apiClient';
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

export async function deconstructCoverSamples(imageUrls: string[], model: string, title: string): Promise<void> {
  const data = await readJson(await apiFetch('/api/generate/headline-deconstruct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrls, model, title }),
  }));
  recordChatTokens({ modelId: typeof data.model === 'string' ? data.model : model, type: 'vision', usage: data.usage });
}
