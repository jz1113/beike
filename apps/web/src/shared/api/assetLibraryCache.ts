import { apiFetch } from '@/shared/api/apiClient';
import type { AssetLibrarySlim } from '@beike/domain/assetLibraryTypes';
import type { PromptAssetType as AssetSubTab } from '@beike/domain/promptAsset/states';

export interface GlobalAssetStore {
  personas: AssetLibrarySlim[];
  outfits: AssetLibrarySlim[];
  scenes: AssetLibrarySlim[];
  actions: AssetLibrarySlim[];
  fullPrompts: AssetLibrarySlim[];
  lastUpdated: number;
  isLoaded: boolean;
}

const store: GlobalAssetStore = {
  personas: [],
  outfits: [],
  scenes: [],
  actions: [],
  fullPrompts: [],
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
      if (requestGeneration === cacheGeneration) {
        Object.assign(store, lists, { isLoaded: true, lastUpdated: Date.now() });
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
 * 同步快速获取当前内存中的资产，0ms 无等待
 */
export function getCachedAssetsSync(tab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action'): AssetLibrarySlim[] {
  if (tab === 'full_prompt') return store.fullPrompts;
  if (tab === 'persona') return store.personas;
  if (tab === 'outfit') return store.outfits;
  if (tab === 'scene') return store.scenes;
  if (tab === 'action') return store.actions;
  return [];
}

/**
 * 是否已经预加载完毕
 */
export function isAssetLibraryLoaded(): boolean {
  return store.isLoaded;
}

/**
 * 资产增删改后使全局缓存失效
 */
export function invalidateGlobalAssetCache() {
  cacheGeneration += 1;
  categoryLoadedAt.clear();
  store.isLoaded = false;
  store.lastUpdated = 0;
  for (const listener of invalidationListeners) listener();
}

/** 按 id 拉取单条资产完整详情（含 reversePromptZh 等长文本） */
export async function fetchAssetDetail(
  activeSubTab: AssetSubTab,
  id: string,
): Promise<Record<string, unknown> | null> {
  const assetType = activeSubTab;
  try {
    const res = await apiFetch(`/api/catalog/assets/library?type=${encodeURIComponent(assetType)}&id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.item) return null;
    return data.item as Record<string, unknown>;
  } catch (err) {
    console.warn('[assetLibraryCache] 获取资产详情失败:', err);
    return null;
  }
}

const categoryLoadedAt = new Map<AssetSubTab, number>();
const categoryRequests = new Map<AssetSubTab, Promise<void>>();
const categoryKeys = { persona: 'personas', outfit: 'outfits', scene: 'scenes', action: 'actions', full_prompt: 'fullPrompts' } as const;
/** The library view loads its current category; workshop preload may still request all. */
export async function getCategoryAssetLibrary(tab: AssetSubTab, force = false): Promise<void> {
  const generation = cacheGeneration;
  const existing = categoryRequests.get(tab);
  if (existing) { await existing; return getCategoryAssetLibrary(tab, force && !categoryLoadedAt.has(tab)); }
  if (!force && Date.now() - (categoryLoadedAt.get(tab) || 0) < 120_000) return;
  const request = (async () => {
    const collected = new Map<string, AssetLibrarySlim>();
    for (let page = 1; ; page++) {
      const res = await apiFetch(`/api/catalog/assets/library?type=${tab}&pageSize=100&page=${page}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '资产加载失败');
      for (const item of data.items || []) collected.set(item.id, item);
      if ((data.items || []).length < 100 || page * 100 >= data.total) break;
    }
    if (cacheGeneration === generation) {
      store[categoryKeys[tab]] = [...collected.values()];
      categoryLoadedAt.set(tab, Date.now());
    }
  })();
  categoryRequests.set(tab, request);
  try { await request; } finally { categoryRequests.delete(tab); }
}
