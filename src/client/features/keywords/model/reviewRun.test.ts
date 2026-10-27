import { describe, expect, it } from 'vitest';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import { ReviewPacer } from './reviewPacer';
import { runKeywordReviewBatches } from './reviewRun';
import type { ReviewRequestError } from './reviewRequest';

function row(id: string): KeywordReviewRecord {
  return { id, query: id, sheetName: 'Sheet1', rowNumber: 1, status: 'idle', sourceValues: {} };
}

class ImmediatePacer extends ReviewPacer {
  override async waitToRetry(_round: number, shouldStop: () => boolean): Promise<boolean> {
    return !shouldStop();
  }

  override async acquire(shouldStop: () => boolean): Promise<boolean> {
    return !shouldStop();
  }

  override succeeded(): void {}

  override failed(): void {}

  override rateLimited(): void {}
}

function gatewayFailure(): ReviewRequestError {
  return Object.assign(new Error('模型网关请求失败，请稍后重试'), {
    gatewayRetryable: true,
    infrastructureFailure: true,
  });
}

function gatewayTimeout(): ReviewRequestError {
  return Object.assign(new Error('模型网关在约 120 秒切断了响应，请减少每批词数后重试（HTTP 524）'), {
    gatewayRetryable: true,
    gatewayTimeout: true,
    infrastructureFailure: true,
  });
}

function doneResult(id: string) {
  return { id, category: '其他', producible: '制作' as const, categoryReason: '可做', rejectReason: '' };
}

function uncertainFailure(): ReviewRequestError {
  return Object.assign(new Error('提交结果待核对，暂不重新收费'), {
    outcomeUncertain: true,
    infrastructureFailure: true,
  });
}

function fatalKeyFailure(): ReviewRequestError {
  return Object.assign(new Error('API Key 无效'), { fatalConfig: true });
}

describe('runKeywordReviewBatches recovery', () => {
  it('requeues exhausted gateway batches until they succeed and reviews the later rows', async () => {
    let stopped = false;
    const marked: Array<{ uncertain?: boolean }> = [];
    const seen: string[] = [];
    const message = await runKeywordReviewBatches({
      queue: [row('a'), row('b'), row('c')],
      candidates: 3,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 1, maxConcurrency: 1 },
      model: { model: 'gemini-3-flash', provider: 'gateway', label: 'gemini' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => stopped,
      requestStop: () => { stopped = true; },
      indices: new Map([['a', 0], ['b', 1], ['c', 2]]),
      versions: new Map(),
      markFailed: async (_ids, _message, uncertain) => { marked.push({ uncertain }); },
      notice: () => {},
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        const id = payload.rows[0].id;
        seen.push(id);
        if (seen.filter((item) => item === id).length <= 24) throw gatewayFailure();
        return { success: true, results: [doneResult(id)], failedIds: [] };
      },
    });
    expect(stopped).toBe(false);
    expect(message).toContain('完成 3 条');
    expect(message).not.toContain('失败');
    expect(message).not.toContain('已暂停');
    expect(seen.filter((id) => id === 'a').length).toBeGreaterThan(1);
    expect(seen).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(marked).toEqual([{ uncertain: false }, { uncertain: false }, { uncertain: false }]);
  });

  it('finishes later rows before revisiting earlier exhausted failures', async () => {
    let stopped = false;
    const attempts = new Map<string, number>();
    const message = await runKeywordReviewBatches({
      queue: [row('a'), row('b'), row('ok'), row('c'), row('d')],
      candidates: 5,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 1, maxConcurrency: 1 },
      model: { model: 'gemini-3-flash', provider: 'gateway', label: 'gemini' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => stopped,
      requestStop: () => { stopped = true; },
      indices: new Map([['a', 0], ['b', 1], ['ok', 2], ['c', 3], ['d', 4]]),
      versions: new Map(),
      markFailed: async () => {},
      notice: () => {},
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        const id = payload.rows[0].id;
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (id === 'ok' || attempt > 24) {
          return {
            success: true,
            results: [doneResult(id)],
            failedIds: [],
          };
        }
        throw gatewayFailure();
      },
    });
    expect(stopped).toBe(false);
    expect(message).toContain('批量审核已处理到最后一个词');
    expect(message).toContain('完成 5 条');
    expect(message).not.toContain('已暂停');
  });

  it('splits a gateway timeout larger than 10 rows instead of repeating it', async () => {
    const queue = Array.from({ length: 12 }, (_, index) => row(`r${index}`));
    const sizes: number[] = [];
    const notices: string[] = [];
    const message = await runKeywordReviewBatches({
      queue,
      candidates: queue.length,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 12, maxConcurrency: 1 },
      model: { model: 'gemini-3.6-flash', provider: 'gateway', label: 'gemini-3.6-flash' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => false,
      requestStop: () => {},
      indices: new Map(queue.map((record, index) => [record.id, index])),
      versions: new Map(),
      markFailed: async () => {},
      notice: (text) => { notices.push(text); },
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        sizes.push(payload.rows.length);
        if (payload.rows.length > 10) throw gatewayTimeout();
        return { success: true, results: payload.rows.map((item) => doneResult(item.id)), failedIds: [] };
      },
    });
    expect(sizes).toEqual([12, 6, 6]);
    expect(notices.some((text) => text.includes('单次响应超时') && text.includes('拆成两批') && text.includes('并行降至 1 路'))).toBe(true);
    expect(notices.some((text) => text.includes('已降至'))).toBe(false);
    expect(message).toContain('完成 12 条');
  });

  it('retries a gateway timeout when the batch is already 10 rows or smaller', async () => {
    const queue = Array.from({ length: 10 }, (_, index) => row(`s${index}`));
    const marked: string[][] = [];
    let calls = 0;
    await runKeywordReviewBatches({
      queue,
      candidates: queue.length,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 10, maxConcurrency: 1 },
      model: { model: 'gemini-3.6-flash', provider: 'gateway', label: 'gemini-3.6-flash' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => false,
      requestStop: () => {},
      indices: new Map(queue.map((record, index) => [record.id, index])),
      versions: new Map(),
      markFailed: async (ids, message) => { marked.push([message, ...ids]); },
      notice: () => {},
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async () => {
        calls += 1;
        if (calls <= 3) throw gatewayTimeout();
        return { success: true, results: queue.map((record) => doneResult(record.id)), failedIds: [] };
      },
    });
    expect(calls).toBe(4);
    expect(marked).toHaveLength(1);
    expect(marked[0][0]).toContain('HTTP 524');
    expect(marked[0].slice(1)).toEqual(queue.map((record) => record.id));
  });

  it('sends the next queue slice at the reduced ceiling after a gateway timeout', async () => {
    const queue = Array.from({ length: 24 }, (_, index) => row(`n${index}`));
    const sizes: number[] = [];
    const notices: string[] = [];
    await runKeywordReviewBatches({
      queue,
      candidates: queue.length,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 12, maxConcurrency: 1 },
      model: { model: 'gemini-3.6-flash', provider: 'gateway', label: 'gemini-3.6-flash' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => false,
      requestStop: () => {},
      indices: new Map(queue.map((record, index) => [record.id, index])),
      versions: new Map(),
      markFailed: async () => {},
      notice: (text) => { notices.push(text); },
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        sizes.push(payload.rows.length);
        if (payload.rows.length > 10) throw gatewayTimeout();
        return { success: true, results: payload.rows.map((item) => doneResult(item.id)), failedIds: [] };
      },
    });
    expect(sizes).toEqual([12, 6, 6, 10, 2]);
    expect(sizes.filter((size) => size === 12)).toEqual([12]);
    expect(notices.some((text) => text.includes('单次响应超时') && text.includes('后续改为每批不超过 10 条') && text.includes('并行降至 1 路'))).toBe(true);
  });

  it('keeps the batch size after a successful request that used to look slow', async () => {
    const queue = Array.from({ length: 24 }, (_, index) => row(`slow${index}`));
    const sizes: number[] = [];
    const notices: string[] = [];
    let now = 0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      await runKeywordReviewBatches({
        queue,
        candidates: queue.length,
        mode: 'all',
        settings: { trialSize: 10, batchSize: 12, maxConcurrency: 1 },
        model: { model: 'gemini-3.6-flash', provider: 'gateway', label: 'gemini-3.6-flash' },
        baseUrl: 'https://example.test',
        apiKey: 'key',
        reviewMode: 'image',
        rulesVersion: 1,
        signal: new AbortController().signal,
        shouldStop: () => false,
        requestStop: () => {},
        indices: new Map(queue.map((record, index) => [record.id, index])),
        versions: new Map(),
        markFailed: async () => {},
        notice: (text) => { notices.push(text); },
        refreshBalance: () => {},
        onDispatch: async () => {},
        onSuccess: async () => {},
        pacer: new ImmediatePacer(1),
        request: async (body) => {
          const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
          sizes.push(payload.rows.length);
          now += 3 * 60_000;
          return { success: true, results: payload.rows.map((item) => doneResult(item.id)), failedIds: [] };
        },
      });
    } finally {
      Date.now = realNow;
    }
    expect(sizes).toEqual([12, 12]);
    expect(notices.some((text) => text.includes('接近网关切断时间'))).toBe(false);
  });

  it('quarantines an uncertain batch without changing its operation and continues', async () => {
    const versions = new Map<number, number>();
    const marked: Array<{ ids: string[]; uncertain?: boolean }> = [];
    const notices: string[] = [];
    let calls = 0;
    const message = await runKeywordReviewBatches({
      queue: [row('held'), row('next')],
      candidates: 2,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 1, maxConcurrency: 1 },
      model: { model: 'gemini-3-flash', provider: 'gateway', label: 'gemini' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => false,
      requestStop: () => {},
      indices: new Map([['held', 0], ['next', 1]]),
      versions,
      markFailed: async (ids, _message, uncertain) => { marked.push({ ids, uncertain }); },
      notice: (text) => { notices.push(text); },
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        calls += 1;
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        if (payload.rows[0]?.id === 'held') throw uncertainFailure();
        return { success: true, results: [doneResult('next')], failedIds: [] };
      },
    });
    expect(calls).toBe(2);
    expect(versions.has(0)).toBe(false);
    expect(marked).toEqual([{ ids: ['held'], uncertain: true }]);
    expect(notices.some((text) => text.includes('可能再次产生费用'))).toBe(false);
    expect(message).toContain('完成 1 条');
    expect(message).toContain('失败 1 条');
  });

  it('stops the run on an invalid key without retrying later rows', async () => {
    let stopped = false;
    const seen: string[] = [];
    const message = await runKeywordReviewBatches({
      queue: [row('a'), row('b')],
      candidates: 2,
      mode: 'all',
      settings: { trialSize: 10, batchSize: 1, maxConcurrency: 1 },
      model: { model: 'gemini-3-flash', provider: 'gateway', label: 'gemini' },
      baseUrl: 'https://example.test',
      apiKey: 'key',
      reviewMode: 'image',
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => stopped,
      requestStop: () => { stopped = true; },
      indices: new Map([['a', 0], ['b', 1]]),
      versions: new Map(),
      markFailed: async () => {},
      notice: () => {},
      refreshBalance: () => {},
      onDispatch: async () => {},
      onSuccess: async () => {},
      pacer: new ImmediatePacer(1),
      request: async (body) => {
        const payload = JSON.parse(body) as { rows: Array<{ id: string }> };
        seen.push(payload.rows[0].id);
        throw fatalKeyFailure();
      },
    });
    expect(stopped).toBe(true);
    expect(seen).toEqual(['a']);
    expect(message).toContain('API Key 无效');
  });
});
