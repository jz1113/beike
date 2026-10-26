import { KeywordReviewResultSchema, type KeywordReviewMode, type KeywordReviewResult } from '@shared/contracts/generate';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { ResolvedTextProtocol } from '@shared/domain/models/textProtocol';
import type { KeywordReviewRecord } from './keywordReviewWorkbook';
import { ReviewPacer, SLOW_GATEWAY_BATCH_MS } from './reviewPacer';
import { DEEPSEEK_BASE_URL, requestReviewBatch, type ReviewRequestError } from './reviewRequest';
import type { ReviewSubmission } from './reviewSubmission';
import { isValidReviewVerdict } from './keywordReviewVerdict';

/** Attempts for one chunk after an unbilled gateway or rate-limit response, including the first try. */
const GATEWAY_RETRY_ATTEMPTS = 8;

export type ReviewRetryReason = 'rate' | 'gateway';

type ReviewPacerControl = Pick<ReviewPacer, 'concurrency' | 'acquire' | 'succeeded' | 'succeededSlow' | 'failed' | 'timedOut' | 'rateLimited'>;

function localProgressFailure(error: unknown, dispatched: boolean): ReviewRequestError {
  const detail = error instanceof Error ? error.message : '无法保存本机进度';
  return Object.assign(new Error(`审核进度保存失败，已暂停提交${dispatched
    ? '；本批结果待核对，暂不重新收费' : '；本批尚未提交模型'}：${detail}`), {
    fatalLocal: true, outcomeUncertain: dispatched, infrastructureFailure: dispatched,
  });
}

function validateBatchResults(
  data: { results?: unknown; failedIds?: unknown },
  rows: KeywordReviewRecord[],
  mode?: KeywordReviewMode,
): { results: KeywordReviewResult[]; failedIds: string[] } {
  const invalid = (): never => {
    throw Object.assign(new Error('审核服务返回的逐行结果不完整；本批提交结果待核对，暂不重新收费'), {
      outcomeUncertain: true, infrastructureFailure: true,
    } satisfies Partial<ReviewRequestError>);
  };
  if (!Array.isArray(data.results) || (data.failedIds !== undefined && !Array.isArray(data.failedIds))) return invalid();
  const expected = new Set(rows.map((row) => row.id));
  const seen = new Set<string>();
  const results: KeywordReviewResult[] = [];
  for (const candidate of data.results) {
    const parsed = KeywordReviewResultSchema.safeParse(candidate);
    if (!parsed.success) return invalid();
    const result = parsed.data;
    if (!expected.has(result.id) || seen.has(result.id) || !isValidReviewVerdict(result, mode) || !result.categoryReason.trim()) return invalid();
    if (result.producible === '不制作' ? !result.rejectReason.trim() : Boolean(result.rejectReason.trim())) return invalid();
    seen.add(result.id);
    results.push(result);
  }
  const failedIds: string[] = [];
  for (const id of data.failedIds || []) {
    if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) return invalid();
    seen.add(id);
    failedIds.push(id);
  }
  if (seen.size !== expected.size) return invalid();
  return { results, failedIds };
}

export function createReviewBatchSubmit(options: {
  model: string;
  provider?: 'deepseek' | 'gateway';
  baseUrl?: string;
  textProtocol?: ResolvedTextProtocol;
  reasoningEffort?: ReasoningEffort;
  reviewMode?: KeywordReviewMode;
  apiKey: string;
  lookup: boolean;
  lookupBudget?: number;
  rulesVersion: number;
  signal: AbortSignal;
  shouldStop: () => boolean;
  indices: Map<string, number>;
  versions: Map<number, number>;
  pacer: ReviewPacerControl;
  onDispatch: (submission: ReviewSubmission) => void | Promise<void>;
  onCancelled?: (submission: ReviewSubmission) => void | Promise<void>;
  onRequestFailure?: (error: ReviewRequestError, submission: ReviewSubmission) => void | Promise<void>;
  onUsage?: (usage: unknown, dispatchedAt: Date) => void;
  onSuccess: (rows: KeywordReviewRecord[], results: KeywordReviewResult[], lookedUp: number, usage: unknown, lookupUsage: unknown, submission: ReviewSubmission) => void | Promise<void>;
  onRateLimit: (concurrency: number, reason: ReviewRetryReason) => void;
  onFailure: () => void;
  request?: typeof requestReviewBatch;
}): (chunk: KeywordReviewRecord[]) => Promise<string[]> {
  return async (chunk) => {
    const sourceIndex = options.indices.get(chunk[0].id) ?? 0;
    const rows = chunk.map(({ id, query, expansion, entityExpansion, contentType }) => ({ id, query, expansion, entityExpansion, contentType }));
    const modeField = options.reviewMode === 'video' ? { reviewMode: 'video' as const } : {};
    const providerField = options.provider === 'gateway' ? { provider: 'gateway' as const } : {};
    const budgetField = options.lookupBudget === undefined ? {} : { lookupBudget: options.lookupBudget };
    const protocolField = options.textProtocol ? { textProtocol: options.textProtocol } : {};
    const effortField = options.reasoningEffort && options.reasoningEffort !== 'auto' ? { reasoningEffort: options.reasoningEffort } : {};
    const baseUrl = options.baseUrl || DEEPSEEK_BASE_URL;
    const payload = JSON.stringify({ model: options.model, lookup: options.lookup, rulesVersion: options.rulesVersion, rows, baseUrl, ...providerField, ...modeField, ...budgetField, ...protocolField, ...effortField });
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    for (let retry = 0; retry < GATEWAY_RETRY_ATTEMPTS; retry += 1) {
      if (!await options.pacer.acquire(options.shouldStop)) return [];
      // The view can unmount between acquiring a slot and resuming this await.
      if (options.shouldStop()) { options.pacer.failed(); return []; }
      const retryVersion = options.versions.get(sourceIndex) ?? 0;
      let outcome: 'succeeded' | 'failed' | 'limited' = 'failed';
      let retryPending = false;
      let retryReason: ReviewRetryReason = 'rate';
      let responseReceived = false;
      let dispatched = false;
      let usageAccounted = false;
      let gatewayTimedOut = false;
      const dispatchedAt = new Date();
      const submission: ReviewSubmission = {
        idempotencyKey: `keyword:${fingerprint}:${retryVersion}`,
        attemptId: crypto.randomUUID(), dispatchedAt: dispatchedAt.getTime(), rows,
        model: options.model, provider: options.provider || 'deepseek',
        baseUrl,
        reviewMode: options.reviewMode || 'image', rulesVersion: options.rulesVersion,
        lookup: options.lookup, ...budgetField,
      };
      try {
        try { await options.onDispatch(submission); }
        catch (error) { throw localProgressFailure(error, false); }
        if (options.shouldStop()) {
          try { await options.onCancelled?.(submission); }
          catch (error) { throw localProgressFailure(error, false); }
          return [];
        }
        dispatched = true;
        const data = await (options.request || requestReviewBatch)(JSON.stringify({
          model: options.model, ...providerField, ...protocolField, ...effortField,
          customBaseUrl: baseUrl, customApiKey: options.apiKey,
          lookup: options.lookup, rulesVersion: options.rulesVersion, rows, ...modeField, ...budgetField,
        }), options.signal, submission.idempotencyKey, { attemptId: submission.attemptId });
        responseReceived = true;
        if (data.usage !== undefined && !(data.usageReplayed ?? data.replayed)) {
          usageAccounted = true;
          try { options.onUsage?.(data.usage, dispatchedAt); }
          catch (error) { throw localProgressFailure(error, true); }
        }
        const { results, failedIds } = validateBatchResults(data, chunk, options.reviewMode);
        outcome = 'succeeded';
        // A successful receipt can contain invalid model rows. Retrying the same
        // chunk must claim a new operation instead of replaying that receipt.
        if (failedIds.length > 0) options.versions.set(sourceIndex, retryVersion + 1);
        const failed = new Set(failedIds);
        const settled = chunk.filter((record) => !failed.has(record.id));
        try { await options.onSuccess(settled, results, Number(data.lookedUp || 0), data.usage, data.lookupUsage, submission); }
        catch (error) { throw localProgressFailure(error, true); }
        return failedIds;
      } catch (error) {
        let failure = error instanceof Error ? error as ReviewRequestError : new Error('审核结果处理异常') as ReviewRequestError;
        // A local callback failure after a paid response must not make that
        // completed operation look safe to submit again with a new key.
        if (responseReceived && failure instanceof Error && !failure.outcomeUncertain) {
          failure.outcomeUncertain = true;
          failure.infrastructureFailure = true;
        }
        const retryable = !failure.outcomeUncertain && (failure.rateLimited === true || failure.gatewayRetryable === true);
        // A 504/524 already used the gateway's time budget. Repeating the same rows times out again.
        const sameBatchRetry = retryable && failure.gatewayTimeout !== true;
        if (failure.gatewayTimeout === true) gatewayTimedOut = true;
        if (sameBatchRetry) {
          outcome = 'limited';
          retryReason = failure.gatewayRetryable && !failure.rateLimited ? 'gateway' : 'rate';
        }
        // The failed attempt's receipt is already stored. The next try must use a new key.
        if (retryable || (failure.modelOutputInvalid && !failure.outcomeUncertain)) {
          options.versions.set(sourceIndex, retryVersion + 1);
        }
        if (!usageAccounted && failure.usage !== undefined && !(failure.usageReplayed ?? failure.replayed)) {
          usageAccounted = true;
          try { options.onUsage?.(failure.usage, dispatchedAt); }
          catch (usageError) { failure = localProgressFailure(usageError, dispatched); }
        }
        try { await options.onRequestFailure?.(failure, submission); }
        catch (progressError) { failure = localProgressFailure(progressError, dispatched); }
        if (sameBatchRetry && !failure.fatalLocal && retry < GATEWAY_RETRY_ATTEMPTS - 1 && !options.shouldStop()) {
          retryPending = true;
        } else {
          try { options.onFailure(); }
          catch (callbackError) { throw localProgressFailure(callbackError, dispatched); }
          throw failure;
        }
      } finally {
        const slowSuccess = outcome === 'succeeded' && Date.now() - dispatchedAt.getTime() >= SLOW_GATEWAY_BATCH_MS;
        if (outcome === 'limited') options.pacer.rateLimited(retry);
        else if (slowSuccess) options.pacer.succeededSlow();
        else if (outcome === 'succeeded') options.pacer.succeeded();
        else if (gatewayTimedOut) options.pacer.timedOut();
        else options.pacer.failed();
      }
      if (retryPending) options.onRateLimit(options.pacer.concurrency, retryReason);
    }
    return [];
  };
}
