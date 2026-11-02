import { apiFetch } from '@client/shared/api/apiClient';
import {
  salesProductListResponseSchema,
  salesProductPatchBodySchema,
  salesProductSingleResponseSchema,
  salesProductUpsertBodySchema,
  type SalesProductPatchBody,
  type SalesProductRecord,
  type SalesProductUpsertBody,
} from '@shared/contracts/salesProducts';
import { eligibleSalesImages } from '@shared/domain/sales';
import { parseProductLink } from '../model/productLink';
import { parseSalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesProductProfile } from '../model/salesProductProfile';

export type { SalesProductPatchBody, SalesProductRecord, SalesProductUpsertBody };

export interface SalesProductListFilters {
  category?: string;
  audience?: string;
  q?: string;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null);
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' && (data as { error: string }).error.trim()) {
    return (data as { error: string }).error;
  }
  return `${fallback}（HTTP ${response.status}）`;
}

/** 将前端商品草稿转换为商品库保存请求体 */
export function buildSalesProductUpsertBody(
  state: SalesCollectionState,
  options?: { markOpened?: boolean },
): SalesProductUpsertBody {
  const normalized = parseSalesCollection(state);
  const usable = eligibleSalesImages(normalized.imageCatalog, normalized.colorSelection, normalized.variantMetadata);
  const profile = salesProductProfile({
    ...normalized,
    images: normalized.imageCatalog,
    isCollected: Boolean(normalized.collectedProductUrl),
  });
  const parsedLink = parseProductLink(normalized.collectedProductUrl || normalized.productUrl);
  const platform = parsedLink.ok ? parsedLink.platform : (normalized.collectionSource || '');
  const coverUrl = usable[0]?.url || normalized.imageCatalog[0]?.url || '';
  const fallbackTitle = profile.sku ? `商品 ${profile.sku}` : normalized.brand ? `${normalized.brand} 商品` : '未命名商品';

  return salesProductUpsertBodySchema.parse({
    ...(normalized.activeProductId ? { id: normalized.activeProductId } : {}),
    title: normalized.productName.trim() || fallbackTitle,
    productUrl: normalized.productUrl.trim(),
    collectedProductUrl: normalized.collectedProductUrl.trim(),
    platform,
    sku: profile.sku || '',
    brand: normalized.brand.trim(),
    category: normalized.category,
    categorySource: normalized.categorySource,
    audience: normalized.audience,
    audienceSource: normalized.audienceSource,
    coverUrl,
    imageCount: normalized.imageCatalog.length,
    selectedImageCount: usable.length,
    hasSummary: Boolean(normalized.productSummary),
    draftJson: JSON.stringify({ ...normalized, activeProductId: '' }),
    ...(options?.markOpened ? { markOpened: true } : {}),
  });
}

/** 从商品库记录还原前端完整商品草稿 */
export function restoreSalesCollectionFromRecord(record: SalesProductRecord): SalesCollectionState {
  let rawDraft: unknown = {};
  try {
    rawDraft = record.draftJson ? JSON.parse(record.draftJson) : {};
  } catch {
    rawDraft = {};
  }
  const parsed = parseSalesCollection(rawDraft);
  return {
    ...parsed,
    activeProductId: record.id,
    productName: record.title || parsed.productName,
    productUrl: parsed.productUrl || record.productUrl,
    collectedProductUrl: parsed.collectedProductUrl || record.collectedProductUrl,
    brand: parsed.brand || record.brand,
    category: record.category,
    categorySource: record.categorySource,
    audience: record.audience,
    audienceSource: record.audienceSource,
  };
}

/** 查询当前工作空间的商品库列表 */
export async function fetchSalesProducts(
  filters: SalesProductListFilters = {},
  signal?: AbortSignal,
): Promise<SalesProductRecord[]> {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.audience && filters.audience !== 'all') params.set('audience', filters.audience);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  const query = params.toString();
  const response = await apiFetch(`/api/sales/products${query ? `?${query}` : ''}`, {
    method: 'GET',
    signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取商品库失败'));
  const parsed = salesProductListResponseSchema.parse(await response.json());
  return parsed.items;
}

/** 读取单条商品详情（含完整草稿 JSON） */
export async function fetchSalesProduct(id: string, signal?: AbortSignal): Promise<SalesProductRecord> {
  const response = await apiFetch(`/api/sales/products/${encodeURIComponent(id)}`, {
    method: 'GET',
    signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '读取商品详情失败'));
  return salesProductSingleResponseSchema.parse(await response.json()).item;
}

/** 新建或更新商品库记录 */
export async function upsertSalesProduct(
  input: SalesProductUpsertBody,
  signal?: AbortSignal,
): Promise<SalesProductRecord> {
  const body = salesProductUpsertBodySchema.parse(input);
  const response = await apiFetch('/api/sales/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '保存商品失败'));
  return salesProductSingleResponseSchema.parse(await response.json()).item;
}

/** 更新商品分类、适用人群、最近打开时间或累加出片次数 */
export async function patchSalesProduct(
  id: string,
  patch: SalesProductPatchBody,
  signal?: AbortSignal,
): Promise<SalesProductRecord> {
  const body = salesProductPatchBodySchema.parse(patch);
  const response = await apiFetch(`/api/sales/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '更新商品失败'));
  return salesProductSingleResponseSchema.parse(await response.json()).item;
}

/** 从商品库删除指定商品 */
export async function deleteSalesProduct(id: string, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch(`/api/sales/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, '删除商品失败'));
}

