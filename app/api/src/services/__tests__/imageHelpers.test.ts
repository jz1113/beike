import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildImageSubmitCandidates,
  fetchWithRetry,
  isNetworkLikeError,
  isRetryableHttpStatus,
  normalizeGatewayBaseUrl,
  shouldUseEditsSubmit,
} from '../imageHelpers';

describe('imageHelpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('identifies retryable HTTP status codes', () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(504)).toBe(true);
    expect(isRetryableHttpStatus(200)).toBe(false);
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
  });

  it('normalizes base urls with trailing /v1', () => {
    expect(normalizeGatewayBaseUrl('https://ai.comfly.org/v1')).toBe('https://ai.comfly.org');
    expect(normalizeGatewayBaseUrl('https://ai.comfly.org/v1/')).toBe('https://ai.comfly.org');
    expect(normalizeGatewayBaseUrl('https://ai.comfly.org/')).toBe('https://ai.comfly.org');
  });

  it('adds standard and fallback candidates for edits submissions', () => {
    expect(buildImageSubmitCandidates(
      ['https://ai.comfly.org/v1/images/edits?async=true'],
      true,
      'https://ai.comfly.org/v1'
    )).toEqual([
      'https://ai.comfly.org/v1/images/edits?async=true',
      'https://ai.comfly.org/v1/images/edits',
      'https://ai.comfly.org/v1/images/generations?async=true',
      'https://ai.comfly.org/v1/images/generations',
    ]);
  });

  it('adds standard candidates for pure text-to-image generations', () => {
    expect(buildImageSubmitCandidates(
      ['https://ai.comfly.org/v1/images/generations?async=true'],
      false,
      'https://ai.comfly.org/v1'
    )).toEqual([
      'https://ai.comfly.org/v1/images/generations?async=true',
      'https://ai.comfly.org/v1/images/generations',
    ]);
  });

  it('detects edits submit urls', () => {
    expect(shouldUseEditsSubmit('https://ai.comfly.org/v1/images/edits?async=true')).toBe(true);
    expect(shouldUseEditsSubmit('https://ai.comfly.org/v1/images/generations?async=true')).toBe(false);
  });

  it('classifies fetch failed as a network error', () => {
    expect(isNetworkLikeError(new Error('fetch failed'))).toBe(true);
    expect(isNetworkLikeError(new Error('HTTP 500'))).toBe(false);
  });

  it('retries once and then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task_123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://ai.comfly.org/v1/images/edits?async=true', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
    }, {
      maxAttempts: 2,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 status code and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task_ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://ai.comfly.org/v1/images/generations?async=true', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
    }, {
      maxAttempts: 2,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
