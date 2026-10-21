/** 轮询时仅吞网络/解析类瞬时错误；业务 FAILURE 必须立刻抛出 */
import { fromImageTaskStatus } from '@shared/domain/core/taskStatus';

export function isTransientPollError(err: unknown): boolean {
  if (!err) return true;
  if (err instanceof Error && err.name === 'ImageGenBusinessError') return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /(failed to fetch|networkerror|network request failed|load failed|econnreset|econnrefused|enotfound|etimedout|eai_again|socket hang up|aborted|unexpected end of json|unexpected token)/i.test(
    msg
  );
}

export function imageGenBusinessError(message: string): Error {
  const err = new Error(message);
  err.name = 'ImageGenBusinessError';
  return Object.assign(err, { retryable: false });
}

export function nonRetryableError(message: string): Error {
  const err = new Error(message);
  err.name = 'NonRetryableError';
  return Object.assign(err, { retryable: false });
}

export type GenerationPollOutcome = 'success' | 'failure' | 'pending';

export function classifyGenerationPollResult(
  data: {
    status?: unknown;
    resultUrl?: unknown;
    failReason?: unknown;
    error?: unknown;
    success?: unknown;
    retryable?: unknown;
    submissionUnknown?: unknown;
  } | null,
  options?: { httpOk?: boolean; httpStatus?: number },
): GenerationPollOutcome {
  if (!data) return 'pending';
  const rawStatus = typeof data.status === 'string' ? data.status.trim() : '';
  const canonical = fromImageTaskStatus(rawStatus || undefined);
  const resultUrl = typeof data.resultUrl === 'string' && data.resultUrl.trim() ? data.resultUrl : '';
  if ((canonical === 'succeeded' || Boolean(resultUrl)) && resultUrl) return 'success';
  if (canonical === 'failed' || canonical === 'cancelled' || canonical === 'expired') return 'failure';
  // A failed status query does not terminate the original generation.
  if (data.retryable === true || data.submissionUnknown === true || rawStatus.toUpperCase() === 'QUERY_FAILED'
    || (options?.httpStatus !== undefined && options.httpStatus >= 500)) return 'pending';
  if (options?.httpOk === false && (data.error || data.success === false)) return 'failure';
  if (data.failReason && !resultUrl && canonical !== 'running' && (canonical !== 'queued' || !rawStatus)) {
    return 'failure';
  }
  return 'pending';
}

export const MAX_TRANSIENT_POLL_FAILURES = 3;

export function accumulateTransientPollFailure(
  counts: Record<string, number>,
  id: string,
  max = MAX_TRANSIENT_POLL_FAILURES,
): boolean {
  const next = (counts[id] || 0) + 1;
  if (next >= max) {
    delete counts[id];
    return true;
  }
  counts[id] = next;
  return false;
}
