import { describe, expect, it } from 'vitest';
import { requestReviewBatch, type ReviewRequestError } from './reviewRequest';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function capture(status: number, body: unknown): Promise<ReviewRequestError> {
  try {
    await requestReviewBatch('{}', new AbortController().signal, 'keyword-key', {
      attemptId: 'attempt-1',
      fetcher: async () => jsonResponse(status, body),
    });
  } catch (error) {
    return error as ReviewRequestError;
  }
  throw new Error('expected the review request to fail');
}

describe('requestReviewBatch', () => {
  it('retries an unbilled gateway 503 instead of quarantining it', async () => {
    const error = await capture(503, { success: false, error: '账本暂不可用', code: 'upstream_api_error' });
    expect(error.rateLimited).toBe(true);
    expect(error.outcomeUncertain).toBeUndefined();
  });

  it('keeps a billed gateway failure out of the free retry path', async () => {
    const error = await capture(503, { success: false, error: '已计费', code: 'upstream_api_error', usage: { total_tokens: 10 } });
    expect(error.rateLimited).toBeUndefined();
    expect(error.outcomeUncertain).toBe(true);
  });
});
