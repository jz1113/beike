import { describe, expect, it } from 'vitest';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import { ReviewPacer } from './reviewPacer';
import { requestReviewBatch } from './reviewRequest';
import { runKeywordReviewBatches } from './reviewRun';

class ImmediatePacer extends ReviewPacer {
  override async acquire(shouldStop: () => boolean) { return !shouldStop(); }
  override async waitToRetry(_round: number, shouldStop: () => boolean) { return !shouldStop(); }
  override succeeded() {}
  override succeededSlow() {}
  override failed() {}
  override timedOut() {}
  override rateLimited() {}
}

function result(id: string) {
  return { id, category: '其他', producible: '制作' as const, categoryReason: '可做', rejectReason: '' };
}

function setup(count: number) {
  let stopped = false;
  const queue: KeywordReviewRecord[] = Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`, query: `词条 ${index}`, sheetName: 'Sheet1', rowNumber: index + 1,
    status: 'idle', sourceValues: {},
  }));
  const completed = new Map<string, number>();
  const failed: string[][] = [];
  const notices: string[] = [];
  const options: Parameters<typeof runKeywordReviewBatches>[0] = {
    queue, candidates: count, mode: 'all',
    settings: { trialSize: 50, batchSize: 50, maxConcurrency: 12 },
    model: { model: 'gemini-3.8-flash', provider: 'gateway', label: 'gemini' },
    baseUrl: 'https://example.test', apiKey: 'key', reviewMode: 'image', rulesVersion: 1,
    signal: new AbortController().signal,
    shouldStop: () => stopped,
    requestStop: () => { stopped = true; },
    indices: new Map(queue.map((record, index) => [record.id, index])), versions: new Map(),
    onWaiting: () => {},
    onDispatch: async () => {},
    onSuccess: async (rows) => {
      for (const row of rows) completed.set(row.id, (completed.get(row.id) ?? 0) + 1);
    },
    markFailed: async (ids) => { failed.push(ids); },
    notice: (message) => { notices.push(message); },
    refreshBalance: () => {}, pacer: new ImmediatePacer(),
  };
  return { options, completed, failed, notices };
}

describe('continuous keyword review', () => {
  it.each(['receipt', 'stream', 'transport', 'invalid-result'])('quarantines %s failures while continuing later rows', async (kind) => {
    const { options, completed, failed } = setup(2);
    options.settings.batchSize = 1;
    const keys: string[] = [];
    const attempted = new Map<string, number>();
    options.request = (body, signal, key, metadata) => requestReviewBatch(body, signal, key, {
      ...metadata, retryDelayMs: 0,
      fetcher: async (_path, init) => {
        const { rows } = JSON.parse(String(init.body)) as { rows: Array<{ id: string }> };
        const id = rows[0].id;
        attempted.set(id, (attempted.get(id) || 0) + 1);
        if (id === 'row-0') {
          keys.push(key);
          if (kind === 'transport') throw new TypeError('连接已中断');
          if (kind === 'invalid-result') return new Response(JSON.stringify({ success: true, results: [], failedIds: [] }));
          return new Response(JSON.stringify({ success: false, error: '提交结果待核对', submissionUnknown: true }),
            { status: kind === 'receipt' ? 409 : 502 });
        }
        return new Response(JSON.stringify({ success: true, results: rows.map((row) => result(row.id)), failedIds: [] }));
      },
    });
    const message = await runKeywordReviewBatches(options);
    expect(new Set(keys).size).toBe(1);
    expect(attempted.get('row-0')).toBe(kind === 'transport' ? 3 : 1);
    expect(attempted.get('row-1')).toBe(1);
    expect(options.versions.has(0)).toBe(false);
    expect([...completed.keys()]).toEqual(['row-1']);
    expect(failed).toEqual([['row-0']]);
    expect(message).toContain('1 条提交待核对');
  });

  it('finishes 50,000 rows after upstream verification failures outlast one retry pass', async () => {
    const { options, completed, notices } = setup(50_000);
    const failedKeys: string[] = [];
    const sent = new Map<string, number>();
    let rejections = 0;
    options.request = (body, signal, key, metadata) => requestReviewBatch(body, signal, key, {
      ...metadata,
      fetcher: async (_path, init) => {
        const { rows } = JSON.parse(String(init.body)) as { rows: Array<{ id: string }> };
        for (const row of rows) sent.set(row.id, (sent.get(row.id) ?? 0) + 1);
        // One batch remains unavailable through two full passes of 8 x 3 attempts.
        if (rows[0].id === 'row-0' && rejections++ < 50) {
          failedKeys.push(key);
          return new Response(JSON.stringify({
            success: false, code: 'upstream_api_error',
            error: '模型网关请求失败，请稍后重试。接口原因：Verify your account to continue.',
          }), { status: 403 });
        }
        return new Response(JSON.stringify({ success: true, results: rows.map((row) => result(row.id)), failedIds: [] }));
      },
    });
    const message = await runKeywordReviewBatches(options);
    expect(completed.size).toBe(50_000);
    expect([...completed.values()].every((times) => times === 1)).toBe(true);
    expect([...sent.entries()].filter(([id]) => Number(id.slice(4)) >= 50).every(([, times]) => times === 1)).toBe(true);
    expect(new Set(failedKeys).size).toBe(50);
    expect(notices.some((notice) => notice.includes('无需手动点击重试'))).toBe(true);
    expect(notices.some((notice) => notice.includes('自动重试第 2 轮'))).toBe(true);
    expect(message).toContain('完成 50000 条');
    expect(message).not.toContain('失败');
  });

  it('retries only the malformed rows after other rows have succeeded', async () => {
    const { options, completed, notices } = setup(2);
    const sent: string[][] = [];
    let attempts = 0;
    options.request = async (body) => {
      const { rows } = JSON.parse(body) as { rows: Array<{ id: string }> };
      sent.push(rows.map((row) => row.id));
      attempts += 1;
      const fail = attempts <= 6;
      return {
        success: true,
        results: rows.filter((row) => !fail || row.id !== 'row-0').map((row) => result(row.id)),
        failedIds: fail ? ['row-0'] : [],
      };
    };
    const message = await runKeywordReviewBatches(options);
    expect(sent).toHaveLength(7);
    expect(sent[0]).toEqual(['row-0', 'row-1']);
    expect(sent.slice(1).every((ids) => ids.length === 1 && ids[0] === 'row-0')).toBe(true);
    expect([...completed.entries()]).toEqual([['row-1', 1], ['row-0', 1]]);
    expect(notices.some((notice) => notice.includes('第 1 轮'))).toBe(true);
    expect(message).toContain('完成 2 条');
    expect(message).not.toContain('失败');
  });

  it('keeps the successful half when the second half throws during format recovery', async () => {
    const { options, completed } = setup(12);
    const sent: string[][] = [];
    options.request = async (body) => {
      const { rows } = JSON.parse(body) as { rows: Array<{ id: string }> };
      sent.push(rows.map((row) => row.id));
      if (sent.length === 1) throw Object.assign(new Error('模型格式异常'), { modelOutputInvalid: true });
      if (sent.length === 3) throw Object.assign(new Error('网关超时'), { gatewayRetryable: true, gatewayTimeout: true });
      return { success: true, results: rows.map((row) => result(row.id)), failedIds: [] };
    };
    const message = await runKeywordReviewBatches(options);
    expect(sent.map((rows) => rows.length)).toEqual([12, 6, 6, 6]);
    expect(sent[3]).toEqual(sent[2]);
    expect(completed.size).toBe(12);
    expect([...completed.values()].every((times) => times === 1)).toBe(true);
    expect(message).toContain('完成 12 条');
  });

  it('stops during the retry cooldown without dispatching another request', async () => {
    const { options, failed, completed } = setup(2);
    let requests = 0;
    options.settings = { trialSize: 1, batchSize: 1, maxConcurrency: 1 };
    const pacer = new ImmediatePacer();
    pacer.waitToRetry = async () => { options.requestStop(); return false; };
    options.pacer = pacer;
    options.request = async (body) => {
      requests += 1;
      const { rows } = JSON.parse(body) as { rows: Array<{ id: string }> };
      if (rows[0].id === 'row-0') throw Object.assign(new Error('模型网关请求失败'), { gatewayRetryable: true });
      return { success: true, results: rows.map((row) => result(row.id)), failedIds: [] };
    };
    const message = await runKeywordReviewBatches(options);
    expect(requests).toBe(25);
    expect([...completed.keys()]).toEqual(['row-1']);
    expect(failed).toEqual([['row-0']]);
    expect(message).toContain('已停止');
    expect(message).toContain('完成 1 条、失败 1 条');
  });

  it('stops for a local progress save failure without sending a model request', async () => {
    const { options, notices } = setup(100);
    let requests = 0;
    options.onDispatch = async () => { throw new Error('磁盘空间不足'); };
    options.request = async () => { requests += 1; return {}; };
    const message = await runKeywordReviewBatches(options);
    expect(requests).toBe(0);
    expect(options.shouldStop()).toBe(true);
    expect(message).toContain('审核进度保存失败');
    expect(notices.some((notice) => notice.includes('无需手动点击重试'))).toBe(false);
  });
});
