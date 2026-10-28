import { describe, expect, it, vi } from 'vitest';
import { createAutomaticSalesWorkflow } from './runAutomaticSalesWorkflow';
import { defaultSalesStudioState, type VideoSalesStudioState } from './salesStudioDraft';

function setup(overrides: Partial<VideoSalesStudioState> = {}) {
  let state: VideoSalesStudioState = {
    ...defaultSalesStudioState,
    selectedChatModel: 'chat-model',
    selectedImageModel: 'image-model',
    selectedVideoModel: 'video-model',
    productName: '针织上衣',
    imageCatalog: [{ index: 0, role: 'main', url: '/product.jpg' }],
    colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
    ...overrides,
  };
  const stateRef = { current: state };
  const busyRef = { current: { collecting: false, planning: false, rendering: false, uploading: false } };
  const autoRunRef = { current: false };
  const order: string[] = [];
  const commit = (recipe: (previous: VideoSalesStudioState) => VideoSalesStudioState) => {
    state = recipe(state);
    stateRef.current = state;
  };
  const runPlan = vi.fn(async () => { order.push('plan'); return true; });
  const runAssets = vi.fn(async () => { order.push('assets'); return true; });
  const autoConfirmAssets = vi.fn(() => { order.push('confirm'); return true; });
  const runFinalize = vi.fn(async () => { order.push('finalize'); return true; });
  const runRender = vi.fn(async () => { order.push('render'); return true; });
  const setError = vi.fn();
  const setIsRunning = vi.fn();
  const run = createAutomaticSalesWorkflow({
    busyRef, stateRef, autoRunRef, commit, setError, setIsRunning,
    runPlan, runRender,
    stages: { runAssets, autoConfirmAssets, runFinalize },
  });
  return { run, stateRef, busyRef, autoRunRef, order, runPlan, runAssets, autoConfirmAssets, runFinalize, runRender, setError, setIsRunning };
}

describe('automatic sales workflow', () => {
  it('runs every post-selection stage in order and releases the running lock', async () => {
    const setupResult = setup();

    await expect(setupResult.run()).resolves.toBe(true);

    expect(setupResult.order).toEqual(['plan', 'assets', 'confirm', 'finalize', 'render']);
    expect(setupResult.setIsRunning).toHaveBeenNthCalledWith(1, true);
    expect(setupResult.setIsRunning).toHaveBeenLastCalledWith(false);
    expect(setupResult.autoRunRef.current).toBe(false);
    expect(setupResult.setError).toHaveBeenCalledWith(null);
  });

  it('stops at the first failed stage and does not continue into paid work', async () => {
    const setupResult = setup();
    setupResult.runAssets.mockImplementation(async () => { setupResult.order.push('assets'); return false; });

    await expect(setupResult.run()).resolves.toBe(false);

    expect(setupResult.order).toEqual(['plan', 'assets']);
    expect(setupResult.autoConfirmAssets).not.toHaveBeenCalled();
    expect(setupResult.runFinalize).not.toHaveBeenCalled();
    expect(setupResult.runRender).not.toHaveBeenCalled();
    expect(setupResult.autoRunRef.current).toBe(false);
  });

  it('ignores an empty selection or an already-running workflow', async () => {
    const empty = setup({ colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] } });
    await expect(empty.run()).resolves.toBe(false);
    expect(empty.runPlan).not.toHaveBeenCalled();

    const running = setup();
    running.autoRunRef.current = true;
    await expect(running.run()).resolves.toBe(false);
    expect(running.runPlan).not.toHaveBeenCalled();
  });
});
