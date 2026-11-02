import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@client/shared/api/apiClient';
import { emptySalesCollection } from '../model/salesCollectionDraft';
import {
  buildSalesProductUpsertBody,
  deleteSalesProduct,
  fetchSalesProducts,
  patchSalesProduct,
  restoreSalesCollectionFromRecord,
  upsertSalesProduct,
} from './salesProducts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('salesProducts API client', () => {
  it('builds upsert payload from collection draft and restores manual classification', () => {
    const draft = {
      ...emptySalesCollection(),
      activeProductId: 'sp_101',
      productName: '红袖条纹针织开衫 2026秋季女装',
      productUrl: 'https://item.jd.com/10233097548161.html',
      collectedProductUrl: 'https://item.jd.com/10233097548161.html',
      brand: '红袖',
      category: 'fashion' as const,
      categorySource: 'manual' as const,
      audience: 'adult_female' as const,
      audienceSource: 'manual' as const,
      imageCatalog: [
        { index: 0, url: '/main.jpg', role: 'main' as const, view: 'front' as const },
        { index: 1, url: '/detail.jpg', role: 'detail' as const },
      ],
      colorSelection: {
        colorLabel: '',
        confirmedImageUrls: ['/main.jpg'],
        excludedImageUrls: [],
      },
    };

    const body = buildSalesProductUpsertBody(draft);
    expect(body.id).toBe('sp_101');
    expect(body.category).toBe('fashion');
    expect(body.categorySource).toBe('manual');
    expect(body.audience).toBe('adult_female');
    expect(body.audienceSource).toBe('manual');
    expect(body.coverUrl).toBe('/main.jpg');
    expect(body.imageCount).toBe(2);
    expect(body.selectedImageCount).toBe(1);

    const restored = restoreSalesCollectionFromRecord({
      id: 'sp_101',
      title: body.title,
      productUrl: body.productUrl,
      collectedProductUrl: body.collectedProductUrl,
      platform: body.platform,
      sku: body.sku,
      brand: body.brand,
      category: 'beauty',
      categorySource: 'manual',
      audience: 'senior_female',
      audienceSource: 'manual',
      coverUrl: body.coverUrl,
      imageCount: body.imageCount,
      selectedImageCount: body.selectedImageCount,
      hasSummary: false,
      outputCount: 2,
      draftJson: body.draftJson,
      lastOpenedAt: '',
      createdAt: '',
      updatedAt: '',
    });
    expect(restored.activeProductId).toBe('sp_101');
    expect(restored.category).toBe('beauty');
    expect(restored.audience).toBe('senior_female');
    expect(restored.colorSelection.confirmedImageUrls).toEqual(['/main.jpg']);
  });

  it('calls list, upsert, patch and delete endpoints with validated payloads', async () => {
    const sampleItem = {
      id: 'sp_1',
      title: '测试商品',
      productUrl: '10001',
      collectedProductUrl: '10001',
      platform: 'jd',
      sku: '10001',
      brand: '',
      category: 'fashion',
      categorySource: 'auto',
      audience: 'adult_female',
      audienceSource: 'auto',
      coverUrl: '/cover.jpg',
      imageCount: 3,
      selectedImageCount: 1,
      hasSummary: true,
      outputCount: 1,
      draftJson: '{}',
      lastOpenedAt: '2026-11-01T12:00:00Z',
      createdAt: '2026-11-01T12:00:00Z',
      updatedAt: '2026-11-01T12:00:00Z',
    };
    const spy = vi.spyOn(apiClient, 'apiFetch').mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(url).startsWith('/api/sales/products?') || (url === '/api/sales/products' && init?.method === 'GET')) {
        return new Response(JSON.stringify({ success: true, items: [sampleItem] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, item: sampleItem }), { status: 200 });
    });

    const list = await fetchSalesProducts({ category: 'fashion', audience: 'adult_female', q: '测试' });
    expect(list).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      '/api/sales/products?category=fashion&audience=adult_female&q=%E6%B5%8B%E8%AF%95',
      expect.objectContaining({ method: 'GET' }),
    );

    const saved = await upsertSalesProduct(buildSalesProductUpsertBody({ ...emptySalesCollection(), productName: '测试商品' }));
    expect(saved.id).toBe('sp_1');

    const patched = await patchSalesProduct('sp_1', { audience: 'child_female', audienceSource: 'manual', incrementOutput: true });
    expect(patched.id).toBe('sp_1');

    await deleteSalesProduct('sp_1');
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

