import { describe, expect, it } from 'vitest';
import {
  batchSetProductImages,
  setPrimaryProductImage,
  toggleProductImageSelection,
} from './batchImageSelection';
import type { BatchProductItem } from '../batchTypes';

function createMockItem(id: string): BatchProductItem {
  return {
    id,
    itemId: 'sku123',
    platform: 'jd',
    title: '测试手机',
    price: 999,
    category: '手机',
    brand: '测试',
    coverImage: 'https://cdn.example.com/main1.jpg',
    mainImages: ['https://cdn.example.com/main1.jpg', 'https://cdn.example.com/main2.jpg'],
    skuImages: ['https://cdn.example.com/sku1.jpg'],
    detailImages: ['https://cdn.example.com/detail1.jpg', 'https://cdn.example.com/detail2.jpg'],
    props: {},
    status: 'success',
    selected: true,
    allTypedImages: [
      { url: 'https://cdn.example.com/main1.jpg', type: 'main' },
      { url: 'https://cdn.example.com/main2.jpg', type: 'main' },
      { url: 'https://cdn.example.com/sku1.jpg', type: 'sku' },
      { url: 'https://cdn.example.com/detail1.jpg', type: 'detail' },
      { url: 'https://cdn.example.com/detail2.jpg', type: 'detail' },
    ],
    selectedProductImages: [],
    prompts: [],
    tasks: [],
  };
}

describe('batchImageSelection', () => {
  it('toggles selection on and off and updates coverImage', () => {
    const items = [createMockItem('item-1')];
    const url1 = 'https://cdn.example.com/main1.jpg';
    const url2 = 'https://cdn.example.com/detail1.jpg';

    // 选中第一张
    const step1 = toggleProductImageSelection(items, 'item-1', url1);
    expect(step1[0].selectedProductImages).toEqual([url1]);
    expect(step1[0].coverImage).toBe(url1);

    // 选中第二张
    const step2 = toggleProductImageSelection(step1, 'item-1', url2);
    expect(step2[0].selectedProductImages).toEqual([url1, url2]);
    expect(step2[0].coverImage).toBe(url1);

    // 取消选中第一张，coverImage 应自动切为当前剩下的第一张
    const step3 = toggleProductImageSelection(step2, 'item-1', url1);
    expect(step3[0].selectedProductImages).toEqual([url2]);
    expect(step3[0].coverImage).toBe(url2);
  });

  it('batch sets product images with modes all_main, first, clear', () => {
    const items = [createMockItem('item-1')];

    // 全选主图
    const allMain = batchSetProductImages(items, 'item-1', 'all_main');
    expect(allMain[0].selectedProductImages).toEqual([
      'https://cdn.example.com/main1.jpg',
      'https://cdn.example.com/main2.jpg',
    ]);
    expect(allMain[0].coverImage).toBe('https://cdn.example.com/main1.jpg');

    // 仅选首图
    const first = batchSetProductImages(items, 'item-1', 'first');
    expect(first[0].selectedProductImages).toEqual(['https://cdn.example.com/main1.jpg']);
    expect(first[0].coverImage).toBe('https://cdn.example.com/main1.jpg');

    // 清空
    const cleared = batchSetProductImages(allMain, 'item-1', 'clear');
    expect(cleared[0].selectedProductImages).toEqual([]);
  });

  it('sets any image as primary reference (#1)', () => {
    const items = [createMockItem('item-1')];
    const url1 = 'https://cdn.example.com/main1.jpg';
    const url2 = 'https://cdn.example.com/detail1.jpg';
    const url3 = 'https://cdn.example.com/sku1.jpg';

    // 先选中 url1 和 url2
    const step1 = toggleProductImageSelection(items, 'item-1', url1);
    const step2 = toggleProductImageSelection(step1, 'item-1', url2);
    expect(step2[0].selectedProductImages).toEqual([url1, url2]);

    // 把 url2 设为主基准 -> url2 应该移动到 index 0
    const step3 = setPrimaryProductImage(step2, 'item-1', url2);
    expect(step3[0].selectedProductImages).toEqual([url2, url1]);
    expect(step3[0].coverImage).toBe(url2);

    // 把尚未选中的 url3 直接设为主基准 -> url3 加入并置顶到 index 0
    const step4 = setPrimaryProductImage(step3, 'item-1', url3);
    expect(step4[0].selectedProductImages).toEqual([url3, url2, url1]);
    expect(step4[0].coverImage).toBe(url3);
  });
});
