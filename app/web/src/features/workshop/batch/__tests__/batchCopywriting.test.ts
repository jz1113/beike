import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordModelUsage } from '@/lib/usageTracker';
import { apiFetch } from '@/lib/apiClient';
import {
  generateAllCopywriting,
  generateCopywritingForProduct,
  type CopywritingContext,
} from '../batchCopywriting';
import { getCopywritingStatusLabel } from '../batchCopywritingStatus';
import type { BatchProductItem } from '../batchTypes';

vi.mock('@/lib/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/usageTracker', () => ({ recordModelUsage: vi.fn(), resolveModelVendor: vi.fn() }));

function product(id: string, overrides: Partial<BatchProductItem> = {}): BatchProductItem {
  return {
    id, title: `商品 ${id}`, selectedProductImages: [], prompts: [],
    tasks: [{ id: `task-${id}`, title: '分镜', shot_no: 1, prompt: '', status: 'SUCCESS', resultUrl: `https://example.com/${id}.jpg` }],
    ...overrides,
  } as BatchProductItem;
}

function context(initial: BatchProductItem[]) {
  let items = initial;
  const ctx: CopywritingContext = {
    getItems: () => items,
    setItems: update => { items = typeof update === 'function' ? update(items) : update; },
    selectedVisionModel: 'test-model', showToast: vi.fn(), analyzeConcurrency: 2,
  };
  return ctx;
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

beforeEach(() => vi.clearAllMocks());

describe('workshop copywriting delivery', () => {
  it('preserves existing text and exposes provider failure for retry', async () => {
    const oldCopy = { title: '人工修改过的标题', content: '人工修改过的正文', tags: ['保留'] };
    const item = product('1', { copywriting: oldCopy });
    const ctx = context([item]);
    vi.mocked(apiFetch).mockResolvedValue(response({ success: false, error: '模型调用超时' }, 504));
    expect(await generateCopywritingForProduct(item, ctx)).toBe(false);
    expect(ctx.getItems()[0]).toMatchObject({ copywriting: oldCopy, copywritingError: '模型调用超时', isCopywritingGenerating: false });
    expect(getCopywritingStatusLabel(ctx.getItems()[0])).toBe('文案重写失败，原稿已保留');
    vi.mocked(apiFetch).mockResolvedValue(response({ success: true, data: { title: '新标题', content: '新正文' } }));
    expect(await generateCopywritingForProduct(ctx.getItems()[0], ctx)).toBe(true);
    expect(ctx.getItems()[0].copywritingError).toBeUndefined();
    expect(getCopywritingStatusLabel(ctx.getItems()[0])).toBe('文案已就绪');
  });

  it('rejects empty model output instead of declaring success', async () => {
    const item = product('1');
    const ctx = context([item]);
    vi.mocked(apiFetch).mockResolvedValue(response({ success: true, data: { title: ' ', content: '' } }));
    expect(await generateCopywritingForProduct(item, ctx)).toBe(false);
    expect(ctx.getItems()[0].copywriting).toBeUndefined();
    expect(ctx.getItems()[0].copywritingError).toContain('完整标题和正文');
  });

  it('records network failures and ends the loading state', async () => {
    const item = product('1');
    const ctx = context([item]);
    vi.mocked(apiFetch).mockRejectedValue(new Error('网络连接已断开'));
    await generateCopywritingForProduct(item, ctx);
    expect(ctx.getItems()[0]).toMatchObject({ copywritingError: '网络连接已断开', isCopywritingGenerating: false });
    expect(getCopywritingStatusLabel(ctx.getItems()[0])).toBe('文案失败，待重试');
  });

  it('reports actual batch outcomes and skips completed copy', async () => {
    const ctx = context([product('1'), product('2'), product('3', { copywriting: { title: '已有标题', content: '已有正文' } })]);
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(response({ success: true, data: { title: '生成标题', content: '生成正文' } }))
      .mockResolvedValueOnce(response({ success: false, error: '请求被限流' }, 429));
    await generateAllCopywriting(ctx);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(ctx.showToast).toHaveBeenLastCalledWith('文案生成结束：成功 1 款，失败 1 款，可重试');
    expect(ctx.getItems()[2].copywriting?.content).toBe('已有正文');
    expect(ctx.getItems()[1].copywritingError).toBe('请求被限流');
  });

  it('deduplicates overlapping batch and single-product requests', async () => {
    const item = product('1');
    const ctx = context([item]);
    let complete!: (value: Response) => void;
    vi.mocked(apiFetch).mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const first = generateAllCopywriting(ctx);
    const second = generateAllCopywriting(ctx);
    const individual = generateCopywritingForProduct(item, ctx);
    expect(ctx.getItems()[0].isCopywritingGenerating).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    complete(response({ success: true, data: { title: '标题', content: '正文' } }));
    await Promise.all([first, second, individual]);
    expect(ctx.showToast).toHaveBeenLastCalledWith('文案生成结束：成功 1 款');
    expect(vi.mocked(ctx.showToast).mock.calls.filter(([message]) => message.startsWith('文案生成结束'))).toHaveLength(1);
  });
});

it('rejects local fallback copy without claiming a successful model call', async () => {
  const item = product('one'); const ctx = context([item]);
  vi.mocked(apiFetch).mockResolvedValue(response({ success: true, fromFallback: true, data: { title: '模板', content: '虚构一周使用体验' } }));
  expect(await generateCopywritingForProduct(item, ctx)).toBe(false);
  expect(ctx.getItems()[0].copywriting).toBeUndefined();
  expect(recordModelUsage).not.toHaveBeenCalled();
});
it('does not manufacture token usage when the provider omitted it', async () => {
  const item = product('one'); const ctx = context([item]);
  vi.mocked(apiFetch).mockResolvedValue(response({ success: true, data: { title: '标题', content: '正文' } }));
  await generateCopywritingForProduct(item, ctx);
  expect(recordModelUsage).toHaveBeenCalledWith(expect.objectContaining({ promptTokens: 0, completionTokens: 0 }));
});
it('stops scheduling more copywriting while preserving the request already in flight', async () => {
  const ctx = context([product('one'), product('two')]); ctx.analyzeConcurrency = 1;
  let stopped = false; ctx.isAborted = () => stopped;
  vi.mocked(apiFetch).mockImplementation(async () => { stopped = true; return response({ success: true, data: { title: '已完成', content: '正文' } }); });
  await generateAllCopywriting(ctx);
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(ctx.getItems()[0].copywriting?.title).toBe('已完成');
  expect(ctx.getItems()[1].copywriting).toBeUndefined();
});
