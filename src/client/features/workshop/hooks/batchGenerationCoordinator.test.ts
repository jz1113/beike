import { describe, expect, it, vi } from 'vitest';
import { startBatchGenerationCoordinator, type BatchCoordinatorDeps } from './batchGenerationCoordinator';
import type { BatchProductItem } from '../model/batchTypes';

const { runSelectedShots } = vi.hoisted(() => ({ runSelectedShots: vi.fn() }));
vi.mock('../model/generation/batchSingleGeneration', () => ({ runSelectedShots }));

function setup() {
  const item: BatchProductItem = { id: 'product-1', itemId: '1234567', platform: 'jd', title: '耳机', category: '数码',
    price: 0, brand: '', coverImage: '/product.jpg', mainImages: ['/product.jpg'], skuImages: [], detailImages: [],
    props: {}, status: 'success', selected: true, allTypedImages: [{ url: '/product.jpg', type: 'main' }],
    selectedProductImages: ['/product.jpg'], tasks: [],
    analyzedSuccess: true, prompts: [{ shot_no: 1, prompt: '已确认的单镜提示词' }],
  };
  const itemsRef = { current: [item] };
  const deps: BatchCoordinatorDeps = {
    config: { selectedQuality: 'high', selectedAspect: '3:4', selectedImageGenModel: 'test-model', selectedShotCount: 1, isAborted: () => false },
    generationStrategy: 'single_shot', imageGenConcurrency: 2, itemsRef,
    setItems: update => { itemsRef.current = typeof update === 'function' ? update(itemsRef.current) : update; },
    runControlRef: { current: { status: 'running' } }, batchId: 'batch', storyboardRevision: 0,
    showToast: vi.fn(), setCurrentStage: vi.fn(), setIsGeneratingBatch: vi.fn(), setTotalTaskCount: vi.fn(),
    setCompletedTaskCount: vi.fn(), setSuccessTaskCount: vi.fn(), setFailTaskCount: vi.fn(),
    autoGenerateCopywriting: true, generateAllCopywriting: vi.fn(async () => {}), createCheckpoint: () => vi.fn(async () => {}),
  };
  return deps;
}

describe('workshop generation orchestration', () => {
  it('does not submit images while another operation is analyzing a product', async () => {
    const deps = setup(); deps.itemsRef.current[0].isAnalyzing = true;
    await startBatchGenerationCoordinator(deps);
    expect(deps.setCurrentStage).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('已有任务执行中'));
  });

  it('keeps the batch locked until automatic copywriting finishes', async () => {
    const deps = setup();
    let release!: () => void;
    const copyPending = new Promise<void>(resolve => { release = resolve; });
    let copyStarted!: () => void;
    const started = new Promise<void>(resolve => { copyStarted = resolve; });
    deps.generateAllCopywriting = vi.fn(() => { copyStarted(); return copyPending; });
    runSelectedShots.mockImplementation(async (_item, _shots, _config, _setItems, progress) => { progress(true); });
    const running = startBatchGenerationCoordinator(deps);
    await started;
    expect(deps.setCurrentStage).toHaveBeenCalledWith(4);
    expect(deps.setIsGeneratingBatch).toHaveBeenLastCalledWith(true);
    const second = setup();
    await startBatchGenerationCoordinator(second);
    expect(second.setCurrentStage).not.toHaveBeenCalled();
    release(); await running;
    expect(deps.setIsGeneratingBatch).toHaveBeenLastCalledWith(false);
  });
});
