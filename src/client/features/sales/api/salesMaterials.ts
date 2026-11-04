import type { PersonaCategory } from '../model/salesPersonaClassification';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { importSalesBgm } from './salesBgm';

export type EditableSalesMaterial = 'persona' | 'scene' | 'action';

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
  if (input.soundType === 'bgm') {
    const bgm = await importSalesBgm({ title: input.title || input.name, audioUrl: input.audioUrl }, signal);
    await updateSalesSound(bgm.id, {
      soundType: 'bgm', title: input.title || input.name,
      description: input.description ?? input.promptText,
      moodTags: input.moodTags ?? input.tags, bpm: input.bpm,
    }, signal);
    return;
  }
  const response = await apiFetch('/api/sales/studio-sounds', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(result?.error || '保存声音资产失败');
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
