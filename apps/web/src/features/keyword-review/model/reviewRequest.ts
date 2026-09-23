import type { KeywordReviewBalance, KeywordReviewResult } from '@beike/contracts/generate';
import { isRecoverableModelOutputError } from './reviewProgress';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const REVIEW_REQUEST_TIMEOUT_MS = 11 * 60_000;

type ReviewResponse = {
  success?: boolean;
  results?: KeywordReviewResult[];
  lookedUp?: number;
  error?: string;
  code?: string;
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

export async function requestReviewBatch(body: string, signal: AbortSignal, idempotencyKey: string): Promise<ReviewResponse> {
  const { apiFetch } = await import('@/shared/api/apiClient');
  let response: Response;
  try {
    response = await apiFetch('/api/generate/keyword-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idempotencyKey },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REVIEW_REQUEST_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const reason = error instanceof Error ? error.message : '网络响应中断';
    throw new Error(`本批提交结果不确定，可能已产生费用；请先核对 DeepSeek 用量后再决定是否重试。${reason}`);
  }
  const data = await response.json() as ReviewResponse;
  if (response.ok && data.success && Array.isArray(data.results)) return data;
  const error = new Error(data.error || `审核请求失败（HTTP ${response.status}）`);
  if (response.status === 429 && data.code === 'deepseek_api_error') {
    throw Object.assign(error, { rateLimited: true });
  }
  if (isRecoverableModelOutputError(response.status, data.code)) {
    throw Object.assign(error, { modelOutputInvalid: true });
  }
  throw error;
}
