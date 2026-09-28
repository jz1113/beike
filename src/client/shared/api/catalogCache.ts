/**
 * 商品与配方的内存缓存。资产库缓存留在 assets feature，避免 shared 反向依赖 feature。
 */
export type CatalogCacheScope = 'products' | 'recipes' | 'all';

let productsCache: unknown[] | null = null;
let recipesCache: unknown[] | null = null;

export function invalidateCatalogCache(scope: CatalogCacheScope = 'all'): void {
  if (scope === 'products' || scope === 'all') {
    productsCache = null;
  }
  if (scope === 'recipes' || scope === 'all') {
    recipesCache = null;
  }
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
