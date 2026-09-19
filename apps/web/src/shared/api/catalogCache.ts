/**
 * 统一 catalog 内存缓存入口（资产库 / 商品 / 配方）
 */
import {
  getGlobalAssetLibrary,
  invalidateGlobalAssetCache,
  type GlobalAssetStore,
} from '@/features/assets/utils/assetLibraryCache';

export type CatalogCacheScope = 'assets' | 'products' | 'recipes' | 'all';

let productsCache: unknown[] | null = null;
let recipesCache: unknown[] | null = null;

export function invalidateCatalogCache(scope: CatalogCacheScope = 'all'): void {
  if (scope === 'assets' || scope === 'all') {
    invalidateGlobalAssetCache();
  }
  if (scope === 'products' || scope === 'all') {
    productsCache = null;
  }
  if (scope === 'recipes' || scope === 'all') {
    recipesCache = null;
  }
}

export async function getCatalogAssets(force = false): Promise<GlobalAssetStore> {
  return getGlobalAssetLibrary(force);
}

export function getCachedProducts(): unknown[] | null {
  return productsCache;
}

export function setCachedProducts(products: unknown[]): void {
  productsCache = products;
}

export function getCachedRecipes(): unknown[] | null {
  return recipesCache;
}

export function setCachedRecipes(recipes: unknown[]): void {
  recipesCache = recipes;
}
