import type { KeywordReviewMode, KeywordReviewResult } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbook';
import { ReviewPacer } from './reviewPacer';
import { DEEPSEEK_BASE_URL, requestReviewBatch } from './reviewRequest';

export function createReviewBatchSubmit(options: {
  model: string;
  provider?: 'deepseek' | 'gateway';
  baseUrl?: string;
  reviewMode?: KeywordReviewMode;
  apiKey: string;
  lookup: boolean;
  lookupBudget?: number;
  rulesVersion: number;
  signal: AbortSignal;
  shouldStop: () => boolean;
  indices: Map<string, number>;
  versions: Map<number, number>;
  pacer: ReviewPacer;
  onDispatch: () => void;
  onSuccess: (rows: KeywordReviewRecord[], results: KeywordReviewResult[], lookedUp: number, usage?: unknown, lookupUsage?: unknown) => void;
  onRateLimit: (concurrency: number) => void;
  onFailure: () => void;
  request?: typeof requestReviewBatch;
}): (chunk: KeywordReviewRecord[]) => Promise<string[]> {
  return async (chunk) => {
    const sourceIndex = options.indices.get(chunk[0].id) ?? 0;
    const rows = chunk.map(({ id, query, expansion, entityExpansion, contentType }) => ({ id, query, expansion, entityExpansion, contentType }));
    const modeField = options.reviewMode === 'video' ? { reviewMode: 'video' as const } : {};
    const providerField = options.provider === 'gateway' ? { provider: 'gateway' as const } : {};
    const budgetField = options.lookupBudget === undefined ? {} : { lookupBudget: options.lookupBudget };
    const payload = JSON.stringify({ model: options.model, lookup: options.lookup, rulesVersion: options.rulesVersion, rows, ...providerField, ...modeField, ...budgetField });
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    for (let retry = 0; retry < 5; retry += 1) {
      if (!await options.pacer.acquire(options.shouldStop)) return [];
      const retryVersion = options.versions.get(sourceIndex) ?? 0;
      options.onDispatch();
      try {
        const data = await (options.request || requestReviewBatch)(JSON.stringify({
          model: options.model, ...providerField,
          customBaseUrl: options.baseUrl || DEEPSEEK_BASE_URL, customApiKey: options.apiKey,
          lookup: options.lookup, rulesVersion: options.rulesVersion, rows, ...modeField, ...budgetField,
        }), options.signal, `keyword:${fingerprint}:${retryVersion}`);
        options.pacer.succeeded();
        const failedIds = Array.isArray(data.failedIds) ? data.failedIds.map(String) : [];
        const failed = new Set(failedIds);
        const settled = chunk.filter((record) => !failed.has(record.id));
        options.onSuccess(settled, data.results as KeywordReviewResult[], Number(data.lookedUp || 0), data.usage, data.lookupUsage);
        return failedIds;
      } catch (error) {
        const limited = (error as Error & { rateLimited?: boolean }).rateLimited === true;
        if (limited) options.pacer.rateLimited(retry);
        else options.pacer.failed();
        if (limited || (error as Error & { modelOutputInvalid?: boolean }).modelOutputInvalid) {
          options.versions.set(sourceIndex, retryVersion + 1);
        }
        if (limited && retry < 4 && !options.shouldStop()) {
          options.onRateLimit(options.pacer.concurrency);
          continue;
        }
        options.onFailure();
        throw error;
      }
    }
    return [];
  };
}
