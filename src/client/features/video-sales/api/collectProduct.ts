import { apiFetch } from '@client/shared/api/apiClient';
import { mapCollectedSalesProduct, type CollectedSalesProduct, type EcommercePlatform } from '../model/productLink';

export async function collectEcommerceProduct(url: string, platform: EcommercePlatform, signal?: AbortSignal, forceRefresh = false): Promise<CollectedSalesProduct> {
  const response = await apiFetch('/api/catalog/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ url, platform, forceRefresh }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success || !data.product) {
    throw new Error(typeof data?.error === 'string' ? data.error : `采集失败（HTTP ${response.status}）`);
  }
  const product = mapCollectedSalesProduct(data, url);
  if (product.productImages.length === 0) {
    throw new Error('万邦没有返回可用商品图，请换一条链接或稍后重试');
  }
  return Object.assign(product, {
    collectionSource: typeof data.apiUsed === 'string' ? data.apiUsed : undefined,
    fromCache: typeof data.fromCache === 'boolean' ? data.fromCache : undefined,
    detailsMissing: !product.imageCatalog.some((image) => image.role === 'detail'),
  });
}
