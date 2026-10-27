import { describe, expect, it, vi } from 'vitest';
import { buildTypedList, runBatchCollect } from './batchCollect';
import type { BatchProductItem } from '../batchTypes';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch }));

const image = (name: string) => `https://cdn.example.com/${name}.jpg`;

describe('buildTypedList', () => {
  it('merges full response groups and keeps cover role without cross-group duplicates', () => {
    const result = buildTypedList({ picUrl: image('sku'), images: [image('sku'), image('detail'), image('extra')], skuImages: [image('sku')], descImages: [image('detail')] }, { details: [image('detail2')] });
    expect(result.typedList).toEqual([
      { url: image('extra'), type: 'main' }, { url: image('sku'), type: 'sku' },
      { url: image('detail'), type: 'detail' }, { url: image('detail2'), type: 'detail' },
    ]);
    expect(result.cleanCover).toBe(image('sku'));
  });

  it('filters animated images and defaults to the first static main view', () => {
    const result = buildTypedList({ mainImages: ['https://cdn.example/a.gif?x=1', image('main')], descImages: ['https://cdn.example/b.GIF'] });
    expect(result.mainImgs).toEqual([image('main')]);
    expect(result.detailImgs).toEqual([]);
  });

  it('keeps all 80 images from stored groups', () => {
    const urls = Array.from({ length: 80 }, (_, index) => image(String(index)));
    expect(buildTypedList({ detailUrls: JSON.stringify({ main: urls }) }).typedList.map(item => item.url)).toEqual(urls);
  });
});

describe('runBatchCollect refresh', () => {
  it('collects a repeated SKU once without selecting an image by default', async () => {
    apiFetch.mockClear();
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, product: { title: '采集标题', mainImages: [image('shared')] } })));
    const update = vi.fn();
    const result = await runBatchCollect(Array.from({ length: 5 }, (_, index) => ({ id: `content-${index}`, itemId: '12345678', platform: 'jd', status: 'pending', importCategory: '手机通讯 / 手机' } as BatchProductItem)), { onItemUpdate: update, onProgress: vi.fn() });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: 5, failed: 0 });
    expect(update.mock.calls.filter(([, patch]) => patch.status === 'success')).toHaveLength(5);
    expect(update).toHaveBeenLastCalledWith('content-4', expect.objectContaining({ category: '手机通讯 / 手机', coverImage: image('shared'), selectedProductImages: [] }));
    apiFetch.mockClear();
  });

  it('shares a failed request without paying for automatic duplicate retries', async () => {
    apiFetch.mockClear(); apiFetch.mockRejectedValue(new Error('网络失败'));
    const result = await runBatchCollect(['a', 'b', 'c'].map(id => ({ id, itemId: '12345678', platform: 'jd', status: 'pending' } as BatchProductItem)), { onItemUpdate: vi.fn(), onProgress: vi.fn() });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: 0, failed: 3 });
    apiFetch.mockClear();
  });
  it('explicitly bypasses cache for successful products when requested', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, product: { mainImages: [image('m')] }, fromCache: false, apiUsed: 'jd.item_get_pro' })));
    const update = vi.fn();
    await runBatchCollect([{ id: '1', itemId: '1234567', status: 'success' } as BatchProductItem], { forceRefresh: true, onItemUpdate: update, onProgress: vi.fn() });
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toMatchObject({ forceRefresh: true });
    expect(update).toHaveBeenLastCalledWith('1', expect.objectContaining({ fromCache: false, apiUsed: 'jd.item_get_pro', status: 'success', coverImage: image('m'), selectedProductImages: [] }));
  });
});
