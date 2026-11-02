import { CoverMemoryResponseSchema } from '@shared/contracts/coverMemory';
import { apiFetch } from '@client/shared/api/apiClient';
import { CoverTemplateDetailSchema, CoverTemplateListSchema } from '@shared/contracts/coverTemplates';
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || '模板库请求失败');
  return body;
}
export async function fetchCoverTemplates(q: string, status: string, offset: number, signal?: AbortSignal) {
  const search = new URLSearchParams({ q, status, offset: String(offset) });
  return CoverTemplateListSchema.parse(await read(await apiFetch(`/api/generate/headline-templates?${search}`, { signal })));
}
export async function fetchCoverTemplate(id: string, signal?: AbortSignal) {
  return CoverTemplateDetailSchema.parse(await read(await apiFetch(`/api/generate/headline-templates?id=${encodeURIComponent(id)}`, { signal })));
}
export async function updateCoverTemplate(id: string, patch: { title?: string; prompt?: string; status?: 'adopted' | 'pending' | 'trashed'; expectedUpdatedAt?: string }) {
  await read(await apiFetch(`/api/generate/headline-templates/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }));
}

export async function exportCoverTemplates() {
  return read(await apiFetch('/api/generate/headline-templates?export=1'));
}

export async function fetchCoverFeedSamples(requestKey: string) {
  return CoverMemoryResponseSchema.parse(await read(await apiFetch(`/api/generate/headline-templates?requestKey=${encodeURIComponent(requestKey)}`))).samples;
}
