import { describe, expect, it } from 'vitest';
import { parseWorkshopProduct } from './parseWorkshopProduct';
import { parseBatchInputLines } from './batchCollect';
import { workshopProductSource } from './productSource';

describe('workshop product sources', () => {
  it('reads IDs from the product path rather than unrelated tracking parameters', () => {
    expect(parseWorkshopProduct('https://item.jd.com/100000123.html?utm=456')).toMatchObject({ platform: 'jd', itemId: '100000123' });
    expect(parseWorkshopProduct('https://detail.1688.com/offer/12345678.html')).toMatchObject({ platform: '1688', itemId: '12345678' });
    expect(parseWorkshopProduct('https://detail.tmall.com/item.htm?id=12345678')).toMatchObject({ platform: 'tmall', itemId: '12345678' });
  });

  it('keeps supported short links intact instead of guessing an SKU from their tokens', () => {
    const url = 'https://m.tb.cn/h.abc1234';
    expect(parseWorkshopProduct(`分享商品 ${url} 查看`)).toEqual({ platform: 'taobao', itemId: url, url });
    expect(parseWorkshopProduct('100000123')).toEqual({ platform: 'jd', itemId: '100000123' });
    expect(parseWorkshopProduct('买第 12345678 款')).toBeNull();
    expect(parseWorkshopProduct('https://jd.com.example.org/12345678')).toBeNull();
    expect(parseWorkshopProduct('https://user:secret@item.jd.com/12345678.html')).toBeNull();
  });

  it('deduplicates historical Tmall IDs and reports ignored lines', () => {
    const parsed = parseBatchInputLines('https://detail.tmall.com/item.htm?id=12345678\n无效商品\n100000123', new Set(['taobao:12345678']));
    expect(parsed.newItems.map(item => item.itemId)).toEqual(['100000123']);
    expect(parsed.skipped).toBe(2);
    expect(parseBatchInputLines('https://item.taobao.com/item.htm?id=12345678', new Set(['tmall:12345678'])).newItems).toEqual([]);
  });

  it('enforces the shared twenty-product batch limit', () => {
    const existing = new Set(Array.from({ length: 19 }, (_, index) => `jd:${10000000 + index}`));
    const parsed = parseBatchInputLines('20000001\n20000002', existing);
    expect(parsed.newItems).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it('uses the original marketplace and never invents a JD link for a local product', () => {
    expect(workshopProductSource({ platform: 'local', itemId: 'local_12345678' })).toBeNull();
    expect(workshopProductSource({ platform: 'taobao', itemId: '12345678' })).toBe('https://item.taobao.com/item.htm?id=12345678');
    expect(workshopProductSource({ platform: '1688', itemId: '12345678' })).toBe('https://detail.1688.com/offer/12345678.html');
    expect(workshopProductSource({ platform: 'jd', itemId: '12345678', url: 'javascript:alert(1)' })).toBe('https://item.jd.com/12345678.html');
  });
});
