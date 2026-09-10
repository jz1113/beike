// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { BatchProductItem } from '../batchTypes';
import {
  toggleProductImageSelection,
  batchSetProductImages,
  toggleReferenceImageSelection,
} from '../batchImageSelection';

function createMockItem(partial?: Partial<BatchProductItem>): BatchProductItem {
  return {
    id: 'test_item_1',
    itemId: '10001',
    platform: 'jd',
    title: '测试商品',
    price: 99,
    category: '数码',
    brand: '测试品牌',
    coverImage: 'https://example.com/cover.jpg',
    mainImages: ['https://example.com/main1.jpg', 'https://example.com/main2.jpg'],
    skuImages: ['https://example.com/sku1.jpg'],
    detailImages: ['https://example.com/detail1.jpg'],
    props: {},
    status: 'success',
    selected: true,
    allTypedImages: [
      { url: 'https://example.com/main1.jpg', type: 'main' },
      { url: 'https://example.com/main2.jpg', type: 'main' },
      { url: 'https://example.com/sku1.jpg', type: 'sku' },
      { url: 'https://example.com/detail1.jpg', type: 'detail' },
    ],
    selectedProductImages: [],
    availableReferenceImages: ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'],
    selectedReferenceImages: [],
    prompts: [],
    tasks: [],
    ...partial,
  };
}

describe('batchImageSelection', () => {
  it('toggleProductImageSelection 切换单图选中状态并联动 coverImage', () => {
    const items = [createMockItem()];
    const img1 = 'https://example.com/main1.jpg';
    const img2 = 'https://example.com/main2.jpg';

    // 选中第一张
    const res1 = toggleProductImageSelection(items, 'test_item_1', img1);
    expect(res1[0].selectedProductImages).toEqual([img1]);
    expect(res1[0].coverImage).toBe(img1);

    // 选中第二张
    const res2 = toggleProductImageSelection(res1, 'test_item_1', img2);
    expect(res2[0].selectedProductImages).toEqual([img1, img2]);
    expect(res2[0].coverImage).toBe(img1);

    // 取消第一张
    const res3 = toggleProductImageSelection(res2, 'test_item_1', img1);
    expect(res3[0].selectedProductImages).toEqual([img2]);
    expect(res3[0].coverImage).toBe(img2);
  });

  it('batchSetProductImages 支持 all_main, all, first, clear 四种模式', () => {
    const items = [createMockItem()];

    // all_main
    const resMain = batchSetProductImages(items, 'test_item_1', 'all_main');
    expect(resMain[0].selectedProductImages).toEqual([
      'https://example.com/main1.jpg',
      'https://example.com/main2.jpg',
    ]);
    expect(resMain[0].coverImage).toBe('https://example.com/main1.jpg');

    // first
    const resFirst = batchSetProductImages(items, 'test_item_1', 'first');
    expect(resFirst[0].selectedProductImages).toEqual(['https://example.com/main1.jpg']);
    expect(resFirst[0].coverImage).toBe('https://example.com/main1.jpg');

    // all
    const resAll = batchSetProductImages(items, 'test_item_1', 'all');
    expect(resAll[0].selectedProductImages).toHaveLength(4);

    // clear
    const resClear = batchSetProductImages(resAll, 'test_item_1', 'clear');
    expect(resClear[0].selectedProductImages).toEqual([]);
  });

  it('toggleReferenceImageSelection 切换对标参考图选中状态', () => {
    const items = [createMockItem()];
    const ref1 = 'https://example.com/ref1.jpg';

    const res1 = toggleReferenceImageSelection(items, 'test_item_1', ref1);
    expect(res1[0].selectedReferenceImages).toEqual([ref1]);

    const res2 = toggleReferenceImageSelection(res1, 'test_item_1', ref1);
    expect(res2[0].selectedReferenceImages).toEqual([]);
  });
});
