import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { collectEcommerceProduct } from './collectProduct';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));

function reply(fromCache = true, details = false) {
  return new Response(JSON.stringify({
    success: true,
    fromCache,
    apiUsed: 'wanbang',
    product: {
      title: '测试商品',
      mainImages: ['https://example.com/main.jpg'],
      detailImages: details ? ['https://example.com/detail.jpg'] : [],
    },
  }), { status: 200 });
}

describe('collectEcommerceProduct refresh', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it('defaults to cached collection and exposes source and missing details', async () => {
    vi.mocked(apiFetch).mockResolvedValue(reply());
    const result = await collectEcommerceProduct('https://item.jd.com/1234567.html', 'jd');
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ forceRefresh: false });
    expect(result).toMatchObject({ fromCache: true, collectionSource: 'wanbang', detailsMissing: true });
  });

  it('passes explicit refresh and abort signal and builds a fresh usable catalog', async () => {
    const controller = new AbortController();
    vi.mocked(apiFetch).mockResolvedValue(reply(false, true));
    const result = await collectEcommerceProduct('https://item.jd.com/1234567.html', 'jd', controller.signal, true);
    expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ forceRefresh: true });
    expect(result).toMatchObject({ fromCache: false, detailsMissing: false });
    expect(result.imageCatalog).toHaveLength(2);
    expect(result.imageCatalog.every((image) => !image.unavailable)).toBe(true);
  });

  it('does not reuse the unavailable flag from a previous collection', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => reply());
    const previous = await collectEcommerceProduct('https://item.jd.com/1234567.html', 'jd');
    previous.imageCatalog[0].unavailable = true;
    const refreshed = await collectEcommerceProduct('https://item.jd.com/1234567.html', 'jd', undefined, true);
    expect(refreshed.imageCatalog[0].unavailable).not.toBe(true);
    expect(previous.imageCatalog[0].unavailable).toBe(true);
  });

  it('rejects unsuccessful collection without returning replacement media', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: false, error: '额度不足' }), { status: 402 }));
    await expect(collectEcommerceProduct('https://item.jd.com/1234567.html', 'jd', undefined, true)).rejects.toThrow('额度不足');
  });
});
