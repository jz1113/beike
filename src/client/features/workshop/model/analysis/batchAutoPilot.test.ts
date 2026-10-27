import { describe, expect, it, vi } from 'vitest';
import type { BatchProductItem } from '../batchTypes';
import { startAutoPilotPipeline } from './batchAutoPilot';

function product(selectedProductImages: string[] = []): BatchProductItem {
  return {
    id: 'product-1',
    itemId: 'sku-1',
    platform: 'jd',
    title: '测试商品',
    price: 0,
    category: '测试',
    brand: '',
    coverImage: 'cover.jpg',
    mainImages: ['cover.jpg'],
    skuImages: [],
    detailImages: [],
    props: {},
    status: 'success',
    selected: true,
    allTypedImages: [{ url: 'cover.jpg', type: 'main' }],
    selectedProductImages,
    prompts: [],
    tasks: [],
  };
}

describe('startAutoPilotPipeline', () => {
  it('requires manual product image selection without filling the first image', async () => {
    const item = product();
    const setItems = vi.fn();
    const startBatchVisionAnalyze = vi.fn().mockResolvedValue(0);
    const setCurrentStage = vi.fn();
    const showToast = vi.fn();

    await startAutoPilotPipeline({
      successfulItems: [item],
      getItems: () => [item],
      setItems,
      startBatchVisionAnalyze,
      setCurrentStage,
      showToast,
      setIsAutoPilotRunning: vi.fn(),
    });

    expect(setCurrentStage).toHaveBeenCalledWith(2);
    expect(showToast).toHaveBeenCalledWith('请先为 1 款商品手动选择至少 1 张商品图');
    expect(startBatchVisionAnalyze).not.toHaveBeenCalled();
    expect(setItems).not.toHaveBeenCalled();
    expect(item.selectedProductImages).toEqual([]);
  });
});
