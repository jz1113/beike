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

  it('keeps delivery reachable during generation so pause and recovery controls are accessible', () => {
    const flow = getWorkshopFlow([product({ tasks: [{ id: 'task', shot_no: 1, title: '', prompt: '', status: 'IN_PROGRESS' }] })],
      { generationStrategy: 'single_shot', selectedShotCount: 4, generating: true });
    expect(flow.busy).toBe(true);
    expect(flow.reasonForStage(4)).toBeNull();
    expect(flow.reasonForStage(2)).not.toBeNull();
  });

  it('does not treat obsolete results as a current delivery', () => {
    const flow = getWorkshopFlow([product({ tasks: [{ id: 'old', shot_no: 1, title: '', prompt: '', status: 'SUCCESS', resultUrl: '/old.jpg', resultStatus: 'superseded' }] })],
      { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.hasResults).toBe(false);
    expect(flow.results.success).toBe(0);
    expect(flow.reasonForStage(4)).not.toBeNull();
  });

  it('does not leave an upload or analysis to visit old results', () => {
    const item = product({ tasks: [{ id: 'task', shot_no: 1, title: '', prompt: '', status: 'SUCCESS', resultUrl: '/image.jpg' }] });
    expect(getWorkshopFlow([item], { generationStrategy: 'single_shot', selectedShotCount: 4, collecting: true }).reasonForStage(4)).not.toBeNull();
    expect(getWorkshopFlow([item], { generationStrategy: 'single_shot', selectedShotCount: 4, analyzing: true }).reasonForStage(4)).not.toBeNull();
  });

  it('can still reach an uncertain old submission after deselecting its product', () => {
    const flow = getWorkshopFlow([product({ selected: false, tasks: [{ id: 'old', shot_no: 1, title: '', prompt: '', status: 'FAILURE', recoveryRequired: true, resultStatus: 'superseded' }] })],
      { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.reasonForStage(4)).toBeNull();
    expect(flow.pendingAnalysisIds).toEqual([]);
  });

  it('does not open an empty delivery for a deselected product with ordinary results', () => {
    const flow = getWorkshopFlow([product({ selected: false, tasks: [{ id: 'task', shot_no: 1, title: '', prompt: '', status: 'SUCCESS', resultUrl: '/image.jpg' }] })],
      { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.hasResults).toBe(false);
    expect(flow.reasonForStage(4)).not.toBeNull();
  });

  it('distinguishes editable prompt issues from products that need paid analysis', () => {
    const prompts = [1, 2, 3, 4].map(shot_no => ({ shot_no, prompt: '已确认提示词' }));
    const flow = getWorkshopFlow([
      product({ id: 'ready', prompts, analyzedSuccess: true }),
      product({ id: 'edit', prompts: prompts.map(shot => ({ ...shot, prompt: '' })), analyzedSuccess: true }),
      product({ id: 'analyze' }), product({ id: 'select', selectedProductImages: [] }),
    ], { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.pendingAnalysisIds).toEqual(['analyze']);
    expect(flow.readiness.readyCount).toBe(1);
    expect(flow.imageReadyCount).toBe(3);
    expect(flow.completedStages).toEqual([1]);
    expect(flow.readiness.issues.find(issue => issue.productId === 'edit')?.resolution).toBe('edit');
  });

  it('rejects out-of-range shot numbers even when their count is correct', () => {
    const flow = getWorkshopFlow([product({ analyzedSuccess: true, prompts: [2, 3, 4, 5].map(shot_no => ({ shot_no, prompt: '场景' })) })],
      { generationStrategy: 'single_shot', selectedShotCount: 4 });
    expect(flow.readiness.canGenerate).toBe(false);
    expect(flow.pendingAnalysisIds).toEqual(['p1']);
  });
});
