import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySalesCollection } from './salesCollectionDraft';
import { createSalesDraftSaver } from './salesDraftSaver';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('deferred collection draft saving', () => {
  it('coalesces rapid edits and writes the latest snapshot once', () => {
    const write = vi.fn(); const saved = vi.fn();
    const saver = createSalesDraftSaver(saved, vi.fn(), write);
    const state = emptySalesCollection();
    for (let i = 0; i < 20; i++) saver.queue({ ...state, productName: `编辑 ${i}` });
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249); expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].productName).toBe('编辑 19');
    expect(saved).toHaveBeenCalledOnce();
  });
  it('flushes before leaving, cancels idle writes and reports failures without discarding later edits', () => {
    const callbacks = new Map<number, () => void>(); let next = 0;
    const cancelIdleCallback = vi.fn((id: number) => callbacks.delete(id));
    vi.stubGlobal('window', { requestIdleCallback: (fn: () => void) => { callbacks.set(++next, fn); return next; }, cancelIdleCallback });
    const write = vi.fn(); const failed = vi.fn(); const saved = vi.fn();
    const saver = createSalesDraftSaver(saved, failed, write);
    saver.queue({ ...emptySalesCollection(), productName: '待保存' });
    vi.advanceTimersByTime(250); expect(write).not.toHaveBeenCalled();
    write.mockImplementationOnce(() => { throw new Error('quota'); });
    saver.flush(); expect(failed).toHaveBeenCalledOnce(); expect(cancelIdleCallback).toHaveBeenCalled();
    saver.queue({ ...emptySalesCollection(), productName: '继续编辑' });
    saver.flush(); vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(2); expect(saved).toHaveBeenCalledOnce();
    expect(write.mock.calls[1][0].productName).toBe('继续编辑');
  });
  it('keeps a failed snapshot available for an explicit retry without another edit', () => {
    const write = vi.fn().mockImplementationOnce(() => { throw new Error('quota'); });
    const saver = createSalesDraftSaver(vi.fn(), vi.fn(), write);
    expect(saver.flush()).toBe(true);
    saver.queue({ ...emptySalesCollection(), productName: '等待重试的完整草稿' });
    expect(saver.flush()).toBe(false);
    expect(saver.hasPending()).toBe(true);
    expect(saver.flush()).toBe(true);
    expect(saver.hasPending()).toBe(false);
    expect(write.mock.calls[1][0].productName).toBe('等待重试的完整草稿');
    vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(2);
  });
});
