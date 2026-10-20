import { apiFetch } from '@client/shared/api/apiClient';
import { PetImportResponseSchema, PetListResponseSchema, type PetImportItem, type PetSummary } from '@shared/contracts/pets';

const sheets = new Map<string, { promise: Promise<string>; url?: string }>();

export async function fetchPets(): Promise<PetSummary[]> {
  const response = await apiFetch('/api/pets');
  const body: unknown = await response.json().catch(() => null);
  const parsed = PetListResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success) throw new Error(errorText(body, '无法读取桌宠'));
  return parsed.data.pets;
}

export async function importPetCommands(commands: string): Promise<PetImportItem[]> {
  const response = await apiFetch('/api/pets/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorText(body, '导入失败'));
  const parsed = PetImportResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error('导入结果无效');
  parsed.data.results.forEach((item) => { if (item.ok && item.id) forgetPetSheet(item.id); });
  return parsed.data.results;
}

export function petSheetURL(id: string) {
  const cached = sheets.get(id);
  if (cached) return cached.promise;
  const entry: { promise: Promise<string>; url?: string } = { promise: Promise.resolve('') };
  entry.promise = apiFetch(`/api/pets/${encodeURIComponent(id)}/spritesheet`).then(async (response) => {
    if (!response.ok) throw new Error('无法读取桌宠精灵图');
    const url = URL.createObjectURL(await response.blob());
    entry.url = url;
    return url;
  }).catch((error: unknown) => {
    sheets.delete(id);
    throw error;
  });
  sheets.set(id, entry);
  return entry.promise;
}

export function forgetPetSheet(id: string) {
  const cached = sheets.get(id);
  if (cached?.url) URL.revokeObjectURL(cached.url);
  sheets.delete(id);
}

function errorText(body: unknown, fallback: string) {
  return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : fallback;
}
