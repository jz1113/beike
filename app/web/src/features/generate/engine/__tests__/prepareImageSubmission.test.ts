import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareImageSubmission, IMAGE_SUBMISSION_MAX_BYTES } from '../prepareImageSubmission';
import { compressImageForSubmission } from '@/lib/image-utils';
import { resolveRefMediaFile } from '@/lib/refMediaRegistry';
vi.mock('@/lib/image-utils', () => ({ compressImageForSubmission: vi.fn() }));
vi.mock('@/lib/refMediaRegistry', () => ({ resolveRefMediaFile: vi.fn() }));
const encode = vi.mocked(compressImageForSubmission);
beforeEach(() => { vi.resetAllMocks(); });
describe('reference submission budget', () => {
  it('budgets every alias, preserves all numbered slots and leaves originals intact', async () => {
    const refs = Array.from({ length: 12 }, (_, i) => `data:image/png;base64,${i}${'A'.repeat(900_000)}`);
    encode.mockImplementation(async (input, limit) => `data:image/jpeg;base64,${String(input).slice(22, 24)}${'B'.repeat(limit - 30)}`);
    const body = { images: [...refs, refs[0]], referenceImageUrl: refs[0], sourceImageUrl: refs[0], prompt: '@图片1 @图片12 中文', size: '4K' };
    const serialized = await prepareImageSubmission(body);
    const result = JSON.parse(serialized);
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(IMAGE_SUBMISSION_MAX_BYTES);
    expect(encode).toHaveBeenCalledTimes(12);
    expect(result.images).toHaveLength(13);
    expect(result.images[0]).toBe(result.images[12]);
    expect(result.referenceImageUrl).toBe(result.images[0]);
    expect(result.sourceImageUrl).toBe(result.images[0]);
    expect(result.prompt).toBe(body.prompt);
    expect(result.size).toBe('4K');
    expect(body.images[0]).toBe(refs[0]);
  });
  it('resolves registered blob files and leaves remote URLs untouched', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    vi.mocked(resolveRefMediaFile).mockReturnValue(file);
    encode.mockResolvedValue('data:image/jpeg;base64,small');
    const result = JSON.parse(await prepareImageSubmission({ images: ['https://example.com/a.jpg', 'blob:local'] }));
    expect(encode.mock.calls[0][0]).toBe(file);
    expect(result.images).toEqual(['https://example.com/a.jpg', 'data:image/jpeg;base64,small']);
  });
  it('rejects broken references rather than silently dropping or submitting originals', async () => {
    encode.mockRejectedValue(new Error('图片已失效'));
    await expect(prepareImageSubmission({ images: ['blob:expired'] })).rejects.toThrow('第 1 张本地参考图处理失败');
  });
  it('honors cancellation before encoding', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(prepareImageSubmission({ images: ['blob:a'] }, controller.signal)).rejects.toThrow();
    expect(encode).not.toHaveBeenCalled();
  });
  it('counts UTF-8 prompt bytes when enforcing the final limit', async () => {
    await expect(prepareImageSubmission({ prompt: '图'.repeat(2_000_001) })).rejects.toThrow('提示词或附加数据');
  });
});
