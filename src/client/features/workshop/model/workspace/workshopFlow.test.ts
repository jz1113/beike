import { describe, expect, it } from 'vitest';
import type { BatchProductItem } from '../batchTypes';
import { getWorkshopFlow } from './workshopFlow';

function product(overrides: Partial<BatchProductItem> = {}): BatchProductItem {
  return {
    id: 'p1', itemId: 'sku-1', platform: 'jd', title: '商品', price: 0, category: '', brand: '', coverImage: '',
    mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
    allTypedImages: [{ url: 'product.jpg', type: 'main' }], selectedProductImages: ['product.jpg'],
    prompts: [], tasks: [], ...overrides,
  };
}

describe('workshop flow gating', () => {
  it('keeps stage navigation predictable before a batch exists', () => {
    const flow = getWorkshopFlow([], { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.reasonForStage(2)).toBe('请先添加并采集商品');
    expect(flow.reasonForStage(3)).toBe('请先为每款商品选择至少一张商品图');
    expect(flow.reasonForStage(4)).toBe('请先在「分析与确认」中确认提示词并开始生图');
  });

  it('allows revisiting selection while keeping analysis blocked until prompts exist', () => {
    const flow = getWorkshopFlow([product()], { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.reasonForStage(2)).toBeNull();
    expect(flow.reasonForStage(3)).toBeNull();
    expect(flow.reasonForStage(4)).toBe('请先在「分析与确认」中确认提示词并开始生图');
    expect(flow.pendingAnalysisIds).toEqual(['p1']);
  });

  it('locks stage switching while work is in progress', () => {
    const flow = getWorkshopFlow([product({ isAnalyzing: true })], { generationStrategy: 'single_shot', selectedShotCount: 4, analyzing: true });
    expect(flow.busy).toBe(true);
    expect(flow.reasonForStage(2)).toBe('任务执行中，请等待当前任务结束后切换步骤');
  });
});
