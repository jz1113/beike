import type { KeywordReviewBalance, KeywordReviewResult } from '@beike/contracts/generate';
import { isRecoverableModelOutputError } from './reviewProgress';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const REVIEW_REQUEST_TIMEOUT_MS = 11 * 60_000;
const SAME_KEY_ATTEMPTS = 3;

type ReviewResponse = {
  success?: boolean;
  results?: KeywordReviewResult[];
  failedIds?: string[];
  lookedUp?: number;
  usage?: unknown;
  lookupUsage?: unknown;
  error?: string;
  code?: string;
  submissionUnknown?: boolean;
};

export type ReviewRequestError = Error & {
  rateLimited?: boolean;
  modelOutputInvalid?: boolean;
  outcomeUncertain?: boolean;
  infrastructureFailure?: boolean;
  fatalConfig?: boolean;
};

export type BalanceResponse = {
  success?: boolean;
  currency?: KeywordReviewBalance['currency'];
  total?: string;
  granted?: string;
  toppedUp?: string;
  available?: boolean;
  error?: string;
};

type ReviewFetch = (path: string, init: RequestInit) => Promise<Response>;

const uncertain = (detail: string): ReviewRequestError => Object.assign(
  new Error(`${detail}；本批提交结果待核对，不会以新任务重复收费`),
  { outcomeUncertain: true, infrastructureFailure: true },
);

function parseReviewResponse(response: Response, raw: string): ReviewResponse {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ReviewResponse;
  } catch { /* A proxy can return an HTML error page during a service restart. */ }
  throw uncertain(`审核服务返回 HTTP ${response.status} 非 JSON 响应`);
}

async function waitForReplay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** A transport replay always uses the same key, so the server returns a receipt or quarantines an unknown charge. */
export async function requestReviewBatch(
  body: string, signal: AbortSignal, idempotencyKey: string,
  options: { fetcher?: ReviewFetch; retryDelayMs?: number } = {},
): Promise<ReviewResponse> {
  const fetcher = options.fetcher || (await import('@/shared/api/apiClient')).apiFetch;
  for (let attempt = 0; attempt < SAME_KEY_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher('/api/generate/keyword-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(REVIEW_REQUEST_TIMEOUT_MS)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      const failure = uncertain('审核服务连接中断');
      if (attempt + 1 === SAME_KEY_ATTEMPTS) throw failure;
      await waitForReplay(options.retryDelayMs ?? 1_500 * (attempt + 1), signal);
      continue;
    }
    let data: ReviewResponse;
    try { data = parseReviewResponse(response, await response.text()); }
    catch (error) {
      if (attempt + 1 === SAME_KEY_ATTEMPTS) throw error;
      await waitForReplay(options.retryDelayMs ?? 1_500 * (attempt + 1), signal);
      continue;
    }
    if (response.ok && data.success && Array.isArray(data.results)) return data;
    if (response.ok) throw uncertain('审核服务返回的结果不完整');
    const error: ReviewRequestError = new Error(data.error || `审核请求失败（HTTP ${response.status}）`);
    if (response.status === 409 && data.submissionUnknown) {
      throw Object.assign(error, { outcomeUncertain: true, infrastructureFailure: true });
    }
    if (response.status === 429 && (data.code === 'deepseek_api_error' || data.code === 'upstream_api_error')) {
      throw Object.assign(error, { rateLimited: true, infrastructureFailure: true });
    }
    if (isRecoverableModelOutputError(response.status, data.code)) {
      throw Object.assign(error, { modelOutputInvalid: true });
    }
    if (response.status >= 500 || response.status === 429) {
      error.infrastructureFailure = true;
      error.outcomeUncertain = true;
      error.message = `${error.message}；提交结果待核对，暂不重新收费`;
    }
    if ([400, 401, 402, 403, 409, 422].includes(response.status)) error.fatalConfig = true;
    throw error;
  }
  throw uncertain('审核服务暂时不可用');
}
