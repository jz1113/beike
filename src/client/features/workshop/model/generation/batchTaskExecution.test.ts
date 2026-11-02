import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSingleImageTask, type TaskExecutionConfig } from './batchTaskExecution';
import type { BatchProductItem } from '../batchTypes';

const io = vi.hoisted(() => ({ compressReference: vi.fn(), submitImage: vi.fn(), finishOutput: vi.fn() }));

function product(): BatchProductItem {
  return { id: 'p1', itemId: 'sku', platform: 'jd', title: '台灯', price: 0, category: '', brand: '', coverImage: 'cover.jpg',
    mainImages: ['cover.jpg'], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
    selectedProductImages: ['front.jpg', 'back.jpg'], allTypedImages: [], tasks: [], prompts: [] };
}
function config() {
  return { selectedQuality: 'high', selectedAspect: '3:4', selectedImageGenModel: 'gpt-image-2', selectedShotCount: 1,
    isAborted: () => false, idempotencyKey: 'original-key', outputSize: '600x800', io,
    beforeSubmit: vi.fn().mockResolvedValue(undefined), onTaskSubmitted: vi.fn(),
  } satisfies TaskExecutionConfig;
}

describe('single shot generation behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    io.compressReference.mockImplementation(async (url: string) => `safe:${url}`);
    io.submitImage.mockResolvedValue({ url: 'original.png', temporary: true });
    io.finishOutput.mockResolvedValue({ url: 'saved.png', temporary: false });
  });

  it('keeps product ordering, skips face for product shots and checkpoints before submission', async () => {
    const options = config();
    await expect(executeSingleImageTask(product(), { shot_no: 1, prompt: '灯具细节', has_human: false }, 'face.jpg', options))
      .resolves.toEqual({ url: 'saved.png', temporary: false });
    expect(io.compressReference.mock.calls).toEqual([['front.jpg'], ['back.jpg']]);
    expect(io.submitImage).toHaveBeenCalledTimes(1);
    expect(options.beforeSubmit.mock.invocationCallOrder[0]).toBeLessThan(io.submitImage.mock.invocationCallOrder[0]);
    expect(io.submitImage).toHaveBeenCalledWith(expect.objectContaining({ productReferenceImages: ['safe:front.jpg', 'safe:back.jpg'],
      anchorFaceImageUrl: undefined, has_human: false, workshopMode: 'storyboard_generate' }), expect.objectContaining({ idempotencyKey: 'original-key', onTaskSubmitted: options.onTaskSubmitted }));
    expect(io.finishOutput).toHaveBeenCalledWith({ url: 'original.png', temporary: true }, expect.any(String), '600x800', 'p1-1.jpg');
  });

  it('does not submit if the durable checkpoint fails', async () => {
    const options = config(); options.beforeSubmit.mockRejectedValueOnce(new Error('quota'));
    await expect(executeSingleImageTask(product(), { shot_no: 1, prompt: '灯具细节' }, undefined, options)).rejects.toThrow('quota');
    expect(io.submitImage).not.toHaveBeenCalled(); expect(io.finishOutput).not.toHaveBeenCalled();
  });

  it('preserves submission errors without replay or output processing', async () => {
    io.submitImage.mockRejectedValueOnce(new Error('submission unknown'));
    await expect(executeSingleImageTask(product(), { shot_no: 1, prompt: '灯具细节' }, undefined, config())).rejects.toThrow('submission unknown');
    expect(io.submitImage).toHaveBeenCalledTimes(1); expect(io.finishOutput).not.toHaveBeenCalled();
  });

  it('rejects missing prompts before any compression or submission', async () => {
    await expect(executeSingleImageTask(product(), { shot_no: 1, prompt: '' }, undefined, config())).rejects.toThrow('提示词不能为空');
    expect(io.compressReference).not.toHaveBeenCalled(); expect(io.submitImage).not.toHaveBeenCalled();
  });
});
