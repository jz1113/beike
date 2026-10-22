import { describe, expect, it } from 'vitest';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import { createReviewBatchSubmit } from './reviewBatchSubmit';
import { SLOW_GATEWAY_BATCH_MS } from './reviewPacer';
import type { ReviewRequestError } from './reviewRequest';

function row(id: string): KeywordReviewRecord {
  return { id, query: id, sheetName: 'Sheet1', rowNumber: 1, status: 'idle', sourceValues: {} };
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

function pacer() {
  return {
    concurrency: 1,
    acquire: async () => true,
    succeeded: () => {},
    succeededSlow: () => {},
    failed: () => {},
    timedOut: () => {},
    rateLimited: () => {},
  };
}

function submit(options: {
  versions: Map<number, number>;
  request: NonNullable<Parameters<typeof createReviewBatchSubmit>[0]['request']>;
  onRateLimit?: Parameters<typeof createReviewBatchSubmit>[0]['onRateLimit'];
}) {
  return createReviewBatchSubmit({
    model: 'gemini-3-flash',
    provider: 'gateway',
    apiKey: 'key',
    lookup: false,
    rulesVersion: 1,
    signal: new AbortController().signal,
    shouldStop: () => false,
    indices: new Map([['a', 4]]),
    versions: options.versions,
    pacer: pacer(),
    onDispatch: async () => {},
    onSuccess: async () => {},
    onRateLimit: options.onRateLimit ?? (() => {}),
    onFailure: () => {},
    request: options.request,
  });
}

describe('createReviewBatchSubmit gateway retry', () => {
  it('retries an unbilled gateway failure with a new idempotency key', async () => {
    const versions = new Map<number, number>([[4, 2]]);
    const keys: string[] = [];
    const reasons: string[] = [];
    let calls = 0;
    const failed = await submit({
      versions,
      onRateLimit: (_concurrency, reason) => { reasons.push(reason); },
      request: async (_body, _signal, key) => {
        calls += 1;
        keys.push(key);
        if (calls < 3) throw gatewayFailure();
        return {
          success: true,
          results: [{ id: 'a', category: '其他', producible: '制作', categoryReason: '可做', rejectReason: '' }],
          failedIds: [],
        };
      },
    })([row('a')]);
    expect(failed).toEqual([]);
    expect(calls).toBe(3);
    expect(keys.map((key) => key.slice(key.lastIndexOf(':')))).toEqual([':2', ':3', ':4']);
    expect(new Set(keys).size).toBe(3);
    expect(versions.get(4)).toBe(4);
    expect(reasons).toEqual(['gateway', 'gateway']);
  });

  it('stops after eight attempts and leaves the failure retryable', async () => {
    const versions = new Map<number, number>();
    let calls = 0;
    const run = submit({
      versions,
      request: async () => {
        calls += 1;
        throw gatewayFailure();
      },
    });
    let caught: ReviewRequestError | undefined;
    try {
      await run([row('a')]);
    } catch (error) {
      caught = error as ReviewRequestError;
    }
    expect(caught?.gatewayRetryable).toBe(true);
    expect(caught?.outcomeUncertain).toBeUndefined();
    expect(calls).toBe(8);
    expect(versions.get(4)).toBe(8);
  });

  it('does not repeat a gateway timeout against the same batch', async () => {
    const versions = new Map<number, number>();
    const reasons: string[] = [];
    let calls = 0;
    const run = submit({
      versions,
      onRateLimit: (_concurrency, reason) => { reasons.push(reason); },
      request: async () => {
        calls += 1;
        throw gatewayTimeout();
      },
    });
    let caught: ReviewRequestError | undefined;
    try {
      await run([row('a')]);
    } catch (error) {
      caught = error as ReviewRequestError;
    }
    expect(caught?.gatewayTimeout).toBe(true);
    expect(caught?.gatewayRetryable).toBe(true);
    expect(calls).toBe(1);
    expect(versions.get(4)).toBe(1);
    expect(reasons).toEqual([]);
  });

  it('keeps raising concurrency until a success reaches the slow threshold', async () => {
    const calls: string[] = [];
    const realDate = globalThis.Date;
    let now = 1_700_000_000_000;
    class Clock extends realDate {
      constructor() { super(now); }
      static override now(): number { return now; }
    }
    globalThis.Date = Clock as DateConstructor;
    const paced = (id: string, index: number, elapsed: number) => createReviewBatchSubmit({
      model: 'gemini-3-flash',
      provider: 'gateway',
      apiKey: 'key',
      lookup: false,
      rulesVersion: 1,
      signal: new AbortController().signal,
      shouldStop: () => false,
      indices: new Map([[id, index]]),
      versions: new Map(),
      pacer: {
        concurrency: 4,
        acquire: async () => true,
        succeeded: () => { calls.push('succeeded'); },
        succeededSlow: () => { calls.push('succeededSlow'); },
        failed: () => { calls.push('failed'); },
        timedOut: () => { calls.push('timedOut'); },
        rateLimited: () => { calls.push('limited'); },
      },
      onDispatch: async () => {},
      onSuccess: async () => {},
      onRateLimit: () => {},
      onFailure: () => {},
      request: async () => {
        now += elapsed;
        return {
          success: true,
          results: [{ id, category: '其他', producible: '制作', categoryReason: '可做', rejectReason: '' }],
          failedIds: [],
        };
      },
    });
    try {
      await paced('a', 4, SLOW_GATEWAY_BATCH_MS - 1)([row('a')]);
      await paced('b', 5, SLOW_GATEWAY_BATCH_MS)([row('b')]);
    } finally {
      globalThis.Date = realDate;
    }
    expect(calls).toEqual(['succeeded', 'succeededSlow']);
    expect(SLOW_GATEWAY_BATCH_MS).toBe(8 * 60_000);
  });
});
