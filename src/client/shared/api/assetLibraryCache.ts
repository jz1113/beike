import { apiRequest } from '@client/shared/api/apiRequest';
import { salesStudioAssetsResponseSchema } from '@shared/contracts/salesProduction';
import { isPlaceholderIdentity } from '@shared/domain/workshop/workshop-pipeline/states';
import type { SalesMaterialCatalog } from '@shared/domain/sales';
import { apiFetch } from '@client/shared/api/apiClient';
import {
  builtinSubcategoryFolderId,
  categoryIds,
  isPromptGroupSubcategory,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  type AssetLibraryItem,
  type AssetLibrarySlim,
  type AssetProductCategory,
  type PromptAssetType as AssetSubTab,
} from '@shared/domain/assets/assetLibraryTypes';

export interface GlobalAssetStore {
  personas: AssetLibrarySlim[];
  outfits: AssetLibrarySlim[];
  scenes: AssetLibrarySlim[];
  actions: AssetLibrarySlim[];
  fullPrompts: AssetLibrarySlim[];
  productCategories: AssetProductCategory[];
  lastUpdated: number;
  isLoaded: boolean;
}

const store: GlobalAssetStore = {
  personas: [],
  outfits: [],
  scenes: [],
  actions: [],
  fullPrompts: [],
  productCategories: [],
  lastUpdated: 0,
  isLoaded: false,
};

let inFlightPromise: Promise<GlobalAssetStore> | null = null;
/** 每次 invalidate 递增；进行中的请求落库前须比对，防止过期响应覆盖新状态 */
let cacheGeneration = 0;
const invalidationListeners = new Set<() => void>();
export function subscribeAssetInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}

/**
 * 全局资产库秒级预加载与缓存获取
 * @param force 是否强制穿透重新请求网络
 */
export async function getGlobalAssetLibrary(force = false): Promise<GlobalAssetStore> {
  const CACHE_TTL = 120_000; // 2 分钟有效缓存
  const isFresh = store.isLoaded && Date.now() - store.lastUpdated < CACHE_TTL;

  if (!force && isFresh) {
    return store;
  }

  if (inFlightPromise) {
    await inFlightPromise;
    return getGlobalAssetLibrary(force && !store.isLoaded);
  }

  const requestGeneration = cacheGeneration;

  inFlightPromise = (async () => {
    try {
      const lists: Pick<GlobalAssetStore, 'personas' | 'outfits' | 'scenes' | 'actions' | 'fullPrompts'> = {
        personas: [], outfits: [], scenes: [], actions: [], fullPrompts: [],
      };
      for (let page = 1; ; page++) {
        const res = await apiFetch(`/api/catalog/assets/library?type=all&slim=1&page=${page}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || '资产加载失败');
        for (const key of Object.keys(lists) as (keyof typeof lists)[]) lists[key].push(...(data[key] || []));
        if (!data.hasMore) break;
      }
      // Load empty and archived folders too, so production sees the same tree as the library.
      const organizationResponse = await apiFetch('/api/catalog/assets/library?view=organization');
      const organization = await organizationResponse.json();
      if (!organizationResponse.ok || !organization.success || !Array.isArray(organization.categories)) {
        throw new Error(organization.error || '资产文件夹加载失败');
      }
      const productCategories: AssetProductCategory[] = organization.categories;
      const names = new Map(productCategories.filter(category => !category.isArchived).map(category => [category.id, category.name]));
      lists.fullPrompts = lists.fullPrompts.map(group => ({
        ...group,
        productCategoryRules: productCategories,
        productCategoryNames: categoryIds(group.productCategoryIds).map(id => names.get(id)).filter((name): name is string => !!name),
        productSubcategoryName: isPromptGroupSubcategory(group.productSubcategory)
          ? names.get(builtinSubcategoryFolderId(group.productSubcategory)) || PROMPT_GROUP_SUBCATEGORY_LABELS[group.productSubcategory]
          : names.get(String(group.productSubcategory || '')) || null,
      }));
      if (requestGeneration === cacheGeneration) {
        Object.assign(store, lists, { productCategories, isLoaded: true, lastUpdated: Date.now() });
      }
    } catch (err) {
      console.warn('[assetLibraryCache] 获取全量资产失败:', err);
      throw err;
    } finally {
      inFlightPromise = null;
    }
    return store;
  })();

  const result = await inFlightPromise;
  return requestGeneration === cacheGeneration ? result : getGlobalAssetLibrary();
}

/**
 * 资产增删改后使全局缓存失效
 */
export function invalidateGlobalAssetCache() {
  cacheGeneration += 1;
  store.isLoaded = false;
  store.lastUpdated = 0;
  for (const listener of invalidationListeners) listener();
}

/** 按 id 拉取单条资产完整详情（含 reversePromptZh 等长文本） */
export async function fetchAssetDetail(
  activeSubTab: AssetSubTab,
  id: string,
): Promise<AssetLibraryItem | null> {
  const assetType = activeSubTab;
  try {
    const res = await apiFetch(`/api/catalog/assets/library?type=${encodeURIComponent(assetType)}&id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.item) return null;
    return typeof data.item.id === 'string' ? data.item as AssetLibraryItem : null;
  } catch (err) {
    console.warn('[assetLibraryCache] 获取资产详情失败:', err);
    return null;
  }
}

type Json = Record<string, unknown>;
const record = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

async function readJSON(response: Response, fallback: string): Promise<Json> {
  const data = record(await response.json().catch(() => null));
  if (response.status === 404 && !data.error) throw new Error('当前服务尚未启用电商视频资产与合成接口，请重启贝壳服务后重试。');
  if (!response.ok || data.success !== true) throw new Error(text(data.error) || `${fallback}（HTTP ${response.status}）`);
  return data;
}

export async function fetchSalesStudioAssets(signal?: AbortSignal): Promise<SalesMaterialCatalog> {
  const response = await apiRequest('GET', '/api/sales/studio-assets', { signal });
  const parsed = salesStudioAssetsResponseSchema.safeParse(await readJSON(response, '读取资产库失败'));
  if (!parsed.success) throw new Error('资产库数据格式不完整');
  return { ...parsed.data, personas: parsed.data.personas.filter((item) => !isPlaceholderIdentity(item, 'persona')) };
}
