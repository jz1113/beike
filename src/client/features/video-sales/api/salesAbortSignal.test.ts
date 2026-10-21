import { afterEach, describe, expect, it, vi } from 'vitest';
import { withSalesAbort } from './salesAbortSignal';
afterEach(() => vi.useRealTimers());

describe('stopping image submissions', () => {
  it('aborts the pending fetch and clears its watcher when the user stops', async () => {
    vi.useFakeTimers();
    let stopped = false;
    const request = withSalesAbort(() => stopped, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')));
    }));
    const outcome = expect(request).rejects.toThrow('stopped');
    stopped = true;
    await vi.advanceTimersByTimeAsync(100);
    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });
});
