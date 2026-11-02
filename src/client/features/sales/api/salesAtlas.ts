import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import {
  salesAtlasCatalogResponseSchema,
  salesAtlasImportBodySchema,
  salesAtlasImportResponseSchema,
  type SalesAtlasCatalogResponse,
  type SalesAtlasImportBody,
  type SalesAtlasImportResponse,
} from '@shared/contracts/salesAtlas';

export async function fetchSalesAtlasCatalog(
  kind: 'all' | 'pose' | 'face' = 'all',
  signal?: AbortSignal,
): Promise<SalesAtlasCatalogResponse> {
  const response = await apiFetch(`/api/sales/atlas/catalog?kind=${encodeURIComponent(kind)}`, {
    method: 'GET',
    signal,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    throw new Error((json && typeof json.error === 'string' && json.error) || '读取开源图鉴目录失败');
  }
  return salesAtlasCatalogResponseSchema.parse(json);
}

export async function importSalesAtlasItems(
  input: SalesAtlasImportBody,
  signal?: AbortSignal,
): Promise<SalesAtlasImportResponse> {
  const body = salesAtlasImportBodySchema.parse(input);
  const response = await apiFetch('/api/sales/atlas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    throw new Error((json && typeof json.error === 'string' && json.error) || '迁入图鉴资产失败');
  }
  invalidateGlobalAssetCache();
  return salesAtlasImportResponseSchema.parse(json);
}

export async function fetchAtlasMediaAsFile(
  mediaUrl: string,
  filename: string,
  signal?: AbortSignal,
): Promise<File> {
  const resolved = proxyMediaUrl(mediaUrl);
  const response = await fetch(resolved, { signal });
  if (!response.ok) {
    throw new Error('读取图鉴原图失败，请确认已同步本地图鉴数据');
  }
  const blob = await response.blob();
  const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const normalizedName = /\.(jpe?g|png|webp)$/i.test(filename) ? filename : `${filename}.${ext}`;
  return new File([blob], normalizedName, { type: mime });
}

