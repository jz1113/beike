import { apiFetch } from '@client/shared/api/apiClient';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { coverDeconstructBody } from '../model/coverReasoning';
import { resolveCoverVisionRoute } from '../model/coverVisionModels';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import {
  CoverMemoryResponseSchema,
  CoverMemoryRevisionSchema,
  type CoverMemoryResponse,
  type CoverMemoryStatus,
} from '@shared/contracts/coverMemory';

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.json().catch(() => null);
  const data = raw && typeof raw === 'object' ? raw : {};
  if (!response.ok || data?.success !== true) {
    throw new Error(typeof data?.error === 'string' ? data.error : '封面记忆请求失败');
  }
  return data;
}

export async function fetchCoverMemory(): Promise<CoverMemoryResponse> {
  const memory = CoverMemoryResponseSchema.parse({ success: true });
  let offset = 0;
  for (;;) {
    const page = CoverMemoryResponseSchema.parse(await readJson(await apiFetch(`/api/generate/headline-memory?offset=${offset}`)));
    memory.entries.push(...page.entries);
    memory.samples.push(...page.samples);
    memory.usages.push(...page.usages);
    memory.revisions.push(...page.revisions);
    if (page.nextOffset == null) break;
    if (page.nextOffset <= offset) throw new Error('封面记忆分页异常，请重新读取');
    offset = page.nextOffset;
  }
  // Concurrent updates can shift page boundaries; never render a record twice.
  memory.entries = [...new Map(memory.entries.map((entry) => [entry.id, entry])).values()];
  memory.samples = [...new Map(memory.samples.map((sample) => [sample.id, sample])).values()];
  memory.usages = [...new Map(memory.usages.map((usage) => [usage.id, usage])).values()];
  memory.revisions = [...new Map(memory.revisions.map((revision) => [revision.id, revision])).values()];
  return memory;
}

export async function readCoverRevision(id: string) {
  const data = await readJson(await apiFetch(`/api/generate/headline-memory/revisions/${encodeURIComponent(id)}`));
  return CoverMemoryRevisionSchema.parse(data.revision);
}

export async function restoreCoverRevision(id: string): Promise<void> {
  await readJson(await apiFetch(`/api/generate/headline-memory/revisions/${encodeURIComponent(id)}/restore`, { method: 'POST' }));
}

export async function saveCoverFeedback(id: string, rating: '' | 'good' | 'bad', note: string, correction: string): Promise<void> {
  await readJson(await apiFetch(`/api/generate/headline-memory/usages/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, note, correction }),
  }));
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
  constructor(message: string, readonly uncertain: boolean, readonly sampleId?: string) {
    super(message);
  }
}

export async function deconstructCoverSample(imageUrl: string, selectionId: string, title: string, effort?: ReasoningEffort, requestKey: string = crypto.randomUUID()): Promise<{ sampleId: string; model: string }> {
  const route = resolveCoverVisionRoute(selectionId);
  let response: Response;
  try {
    response = await apiFetch('/api/generate/headline-deconstruct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...coverDeconstructBody(route, imageUrl, title, effort), requestKey }),
    });
  } catch (error) {
    throw new CoverDeconstructError(error instanceof Error ? error.message : '反推请求没有完成', true);
  }
  const raw = await response.json().catch(() => null);
  const data = raw && typeof raw === 'object' ? raw : {};
  if (!response.ok || data?.success !== true) {
    const message = typeof data?.error === 'string' ? data.error : '封面反推失败';
    throw new CoverDeconstructError(message, data.uncertain === true || response.status >= 500 || !('success' in data) || message.includes('请先刷新核对'), typeof data.sampleId === 'string' ? data.sampleId : undefined);
  }
  const sampleId = typeof data.sampleId === 'string' ? data.sampleId : '';
  if (!sampleId) throw new CoverDeconstructError('反推没有保存到封面记忆', true);
  const model = typeof data.model === 'string' ? data.model : route.modelId;
  recordChatTokens({ modelId: model, type: 'vision', usage: data.usage });
  return { sampleId, model };
}
