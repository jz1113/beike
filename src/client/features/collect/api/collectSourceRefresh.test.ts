import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { RateLimiter } from '@client/shared/utils/rateLimiter';
import { collectSourceMedia } from './collectSourceMedia';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url }));
vi.mock('@client/shared/utils/externalScraperCredentials', () => ({ getExternalScraperCredentials: async () => ({ preferredScraper: 'auto' }) }));

function reply(fromCache: boolean, withDetails: boolean) {
  return new Response(JSON.stringify({
    success: true, fromCache, apiUsed: 'wanbang',
    product: {
      title: '测试商品', platform: 'jd',
      mainImages: ['https://example.com/main.jpg'],
      detailImages: withDetails ? ['https://example.com/detail.jpg'] : [],
    },
  }));
}

describe('collectSourceMedia refresh', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it.each([false, true])('passes forceRefresh=%s and preserves response source', async (forceRefresh) => {
    vi.mocked(apiFetch).mockResolvedValue(reply(!forceRefresh, forceRefresh));
    const result = await collectSourceMedia('https://item.jd.com/1234567.html', 'jd', forceRefresh, new RateLimiter(), new AbortController().signal);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ forceRefresh });
    expect(result).toMatchObject({ fromCache: !forceRefresh, apiUsed: 'wanbang', detailsMissing: !forceRefresh });
  });

  it('does not dispatch an aborted refresh', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collectSourceMedia('https://item.jd.com/1234567.html', 'jd', true, new RateLimiter(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
