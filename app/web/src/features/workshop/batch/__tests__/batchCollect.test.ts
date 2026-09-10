// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseBatchInputLines, buildTypedList } from '../batchCollect';

describe('batchCollect - parseBatchInputLines', () => {
  it('正确识别各电商平台与 itemId 提取', () => {
    const text = `
      https://item.jd.com/100012345678.html
      https://detail.tmall.com/item.htm?id=65432109876
      https://detail.1688.com/offer/987654321.html
      888899990000
    `;
    const res = parseBatchInputLines(text, new Set());
    expect(res.error).toBeUndefined();
    expect(res.newItems).toHaveLength(4);

    expect(res.newItems[0].platform).toBe('jd');
    expect(res.newItems[0].itemId).toBe('100012345678');

    expect(res.newItems[1].platform).toBe('taobao');
    expect(res.newItems[1].itemId).toBe('65432109876');

    expect(res.newItems[2].platform).toBe('1688');
    expect(res.newItems[2].itemId).toBe('987654321');

    expect(res.newItems[3].platform).toBe('jd');
    expect(res.newItems[3].itemId).toBe('888899990000');
  });

  it('正确过滤已有 itemId，且空输入与全重复返回错误提示', () => {
    // 空输入
    const emptyRes = parseBatchInputLines('   \n  ', new Set());
    expect(emptyRes.error).toBe('EMPTY_INPUT');
    expect(emptyRes.newItems).toHaveLength(0);

    // 全重复
    const existing = new Set(['100012345678']);
    const dupRes = parseBatchInputLines('https://item.jd.com/100012345678.html', existing);
    expect(dupRes.error).toBe('NO_NEW_ITEMS');
    expect(dupRes.newItems).toHaveLength(0);
  });
});

describe('batchCollect - buildTypedList', () => {
  it('主图、SKU 图、详情图按序去重整合，且 cleanCover 正确生效', () => {
    const mockProd = {
      title: '测试商品',
      picUrl: 'https://img.com/cover.jpg',
      mainImages: ['https://img.com/cover.jpg', 'https://img.com/main2.jpg'],
      skuImages: ['https://img.com/sku1.jpg', 'https://img.com/cover.jpg'], // 重复 cover
      detailImages: ['https://img.com/detail1.jpg'],
    };

    const res = buildTypedList(mockProd);
    expect(res.cleanCover).toBe('https://img.com/cover.jpg');
    expect(res.typedList).toHaveLength(4);
    expect(res.typedList[0]).toEqual({ url: 'https://img.com/cover.jpg', type: 'main' });
    expect(res.typedList[1]).toEqual({ url: 'https://img.com/main2.jpg', type: 'main' });
    expect(res.typedList[2]).toEqual({ url: 'https://img.com/sku1.jpg', type: 'sku' });
    expect(res.typedList[3]).toEqual({ url: 'https://img.com/detail1.jpg', type: 'detail' });
  });

  it('支持 detailUrls JSON 字符串解析回退', () => {
    const mockProd = {
      title: '测试商品',
      picUrl: 'https://img.com/cover.jpg',
      mainImages: [],
      skuImages: [],
      detailImages: [],
      detailUrls: JSON.stringify(['https://img.com/detail_json.jpg']),
    };

    const res = buildTypedList(mockProd);
    expect(res.detailImgs).toEqual(['https://img.com/detail_json.jpg']);
    expect(res.typedList).toEqual([
      { url: 'https://img.com/cover.jpg', type: 'main' },
      { url: 'https://img.com/detail_json.jpg', type: 'detail' },
    ]);
  });
});
