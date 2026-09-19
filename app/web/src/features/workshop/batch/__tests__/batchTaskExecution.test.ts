import { expect, it, vi } from 'vitest';
import { executeSingleImageTask, executeGridImageTask, generateItemViaGrid } from '../batchTaskExecution';
import type { TaskExecutionConfig } from '../batchTaskExecution';
import type { BatchProductItem } from '../batchTypes';
const mocks = vi.hoisted(() => ({ submit: vi.fn(async () => 'result'), slice: vi.fn(async () => ['a','b','c','d']) }));
vi.mock('@/lib/imageGridSlicer', () => ({ sliceGridImage2x2: mocks.slice }));
vi.mock('../batchImageTasks', () => ({ compressProductImageIfNeeded: async (url: string) => url, submitImageGenTask: mocks.submit }));
it('never sends face reference to static or hands shots despite a legacy global true flag', async () => {
  const item = { title: '手机', selectedProductImages: ['product'], coverImage: 'product' } as BatchProductItem;
  const config = { batchMode: 'original', hasHumanPersona: true, selectedAspect: '3:4', selectedQuality: 'high', selectedImageGenModel: 'test', isAborted: () => false } as TaskExecutionConfig;
  for (const shot_type of ['pure_product', 'hand_held_only']) {
    await executeSingleImageTask(item, { shot_no: 1, prompt: '资产原始构图', has_human: false, shot_type }, 'face', config);
    expect(mocks.submit.mock.lastCall?.[0]).toMatchObject({ has_human: false, shot_type });
    expect(mocks.submit.mock.lastCall?.[0].anchorFaceImageUrl).toBeUndefined();
  }
});
it('blocks an old phone packaging shot before a paid generation request', async () => {
  mocks.submit.mockClear();
  const item = { title: '手机', selectedProductImages: ['product'], coverImage: 'product' } as BatchProductItem;
  const config = { batchMode: 'original', selectedAspect: '3:4', selectedQuality: 'high', selectedImageGenModel: 'test', isAborted: () => false } as TaskExecutionConfig;
  await expect(executeSingleImageTask(item, { shot_no: 4, title: '斜置包装俯视机位', prompt: '拍摄包装盒' }, undefined, config)).rejects.toThrow('重新分析');
  expect(mocks.submit).not.toHaveBeenCalled();
});

it.each([['1:1', 1440, 1440], ['16:9', 1920, 1080], ['9:16', 1080, 1920], ['3:4', 1440, 1920]] as const)('preserves requested %s aspect ratio when slicing the grid', async (aspect, width, height) => {
  const item = { id: 'one', title: '商品', selectedProductImages: ['product'], gridPrompt: 'four shots', prompts: Array.from({length: 4}, (_, i) => ({ shot_no: i + 1, prompt: 'shot' })), tasks: [] } as unknown as BatchProductItem;
  const config = { batchMode: 'original', selectedAspect: aspect, selectedQuality: 'high', selectedImageGenModel: 'test', isAborted: () => false } as TaskExecutionConfig;
  await generateItemViaGrid(item, item.id, config, vi.fn(), vi.fn());
  expect(mocks.slice).toHaveBeenLastCalledWith('result', expect.objectContaining({ targetWidth: width, targetHeight: height }));
});
it('uses confirmed per-shot edits when rebuilding a grid prompt', async () => {
  const item = { id: 'one', title: '商品', selectedProductImages: ['product'], prompts: Array.from({length: 4}, (_, i) => ({ shot_no: i + 1, prompt: `人工确认的新描述 ${i}` })) } as BatchProductItem;
  await executeGridImageTask(item, { batchMode: 'original', selectedShotCount: 4, selectedAspect: '1:1', selectedQuality: 'high', selectedImageGenModel: 'test', isAborted: () => false } as TaskExecutionConfig);
  expect(mocks.submit.mock.lastCall?.[0].prompt).toContain('人工确认的新描述 2');
});
