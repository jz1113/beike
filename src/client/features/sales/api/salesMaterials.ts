import { apiFetch } from '@client/shared/api/apiClient';
import { apiRequest } from '@client/shared/api/apiRequest';
export { fetchSalesStudioAssets } from '@client/shared/api/assetLibraryCache';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { salesPromptListSchema, salesPromptResultSchema } from '@shared/contracts/salesAssetViews';
import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesMaterialCatalog } from '@shared/domain/sales';
import type { PersonaCategory } from '../model/salesActionViews';
import type { SalesImageImportKind } from '../model/salesImageImport';
import { submitSalesAssetJob } from './salesAssetJobs';

export type EditableSalesMaterial = 'persona' | 'scene' | 'action';
export type SalesStudioAssetCatalog = SalesMaterialCatalog;

export async function createSalesMaterial(assetType: EditableSalesMaterial, data: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch('/api/catalog/assets/library', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ assetType, data }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '保存素材资产失败');
  invalidateGlobalAssetCache();
}

export async function updateSalesMaterial(assetType: EditableSalesMaterial, id: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch('/api/catalog/assets/library', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ assetType, id, data }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '更新素材资产失败');
  invalidateGlobalAssetCache();
}

export async function deleteSalesMaterial(assetType: EditableSalesMaterial | 'outfit', id: string, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch(`/api/catalog/assets/library?type=${encodeURIComponent(assetType)}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE', signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '删除素材资产失败');
  invalidateGlobalAssetCache();
  if (!result.count) throw new Error('未删除资产：记录已移除或不属于当前工作区');
}

export interface StudioSoundInput {
  soundType: 'voice' | 'bgm';
  name?: string;
  title?: string;
  description?: string;
  promptText?: string;
  gender?: string;
  voiceGroup?: PersonaCategory;
  voiceId?: string;
  audioUrl?: string;
  tags?: string[];
  moodTags?: string[];
  bpm?: number;
  durationSec?: number;
}

export async function createSalesSound(input: StudioSoundInput, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch('/api/sales/studio-sounds', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '保存声音资产失败');
  invalidateGlobalAssetCache();
}

export async function updateSalesSound(id: string, input: Partial<StudioSoundInput>, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch(`/api/sales/studio-sounds/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '更新声音资产失败');
}

export async function deleteSalesSound(id: string, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch(`/api/sales/studio-sounds/${encodeURIComponent(id)}`, {
    method: 'DELETE', signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '删除声音资产失败');
}

export async function importSalesImageAsset(kind: SalesImageImportKind, data: Record<string, unknown>, background: { model: string } | undefined, signal: AbortSignal): Promise<void> {
  if (!background) { await createSalesMaterial(kind, data, signal); return; }
  const dimensions = audienceDimensions(data.dimensions);
  const views = audienceDimensions(dimensions[kind === 'persona' ? 'personaViews' : 'sceneViews']);
  const key = dimensions.salesImageImportKey;
  if (!background.model.trim() || typeof key !== 'string' || !key || typeof views.main !== 'string' || !views.main) throw new Error('请选择生图模型并检查导入图片后重试');
  await submitSalesAssetJob(kind, { key, model: background.model, references: [views.main] }, data, undefined, signal);
}

export async function uploadSalesCustomAsset(file: File, category: 'assets' | 'videos', signal?: AbortSignal): Promise<string> {
  return uploadStudioFile(file, category, signal);
}

export class SalesPromptRequestError extends Error {
  constructor(message: string, readonly status: number, readonly promptId = '') { super(message); }
}

async function responseJSON(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : response.status === 404 ? '当前服务尚未启用提示词管理，请重启贝壳服务后重试。' : '提示词请求失败，请重试';
    throw new SalesPromptRequestError(message, response.status);
  }
  return data;
}

export async function listSalesPrompts(signal?: AbortSignal) {
  const response = await apiRequest('GET', '/api/sales/prompts', { signal, cache: 'no-store' });
  return salesPromptListSchema.parse(await responseJSON(response)).prompts;
}

export async function saveSalesPrompt(id: string, prompt: string, expectedVersion: string) {
  const response = await apiRequest('PUT', '/api/sales/prompts/{id}', {
    pathParams: { id }, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, expectedVersion }),
  });
  const saved = salesPromptResultSchema.parse(await responseJSON(response)).prompt;
  if (saved.id !== id || saved.prompt !== prompt || !saved.configured) throw new Error('后台返回的提示词与本次保存不一致，请刷新核对；编辑内容已保留。');
  return saved;
}
