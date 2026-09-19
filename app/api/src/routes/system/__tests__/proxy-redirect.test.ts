import { afterEach, expect, it, vi } from 'vitest';
vi.mock('dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }));
import { fetchRemote } from '../proxy-image/fetcher';
afterEach(() => vi.unstubAllGlobals());
it('blocks redirects to private hosts before making the second request', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchRemote('https://sns-img-hw.xhscdn.com/redirect', {})).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
});
it('follows relative redirects to allowed media', async () => {
  const media = new Response('image');
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/image.png' } })).mockResolvedValueOnce(media);
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchRemote('https://sns-img-hw.xhscdn.com/redirect', {})).toBe(media);
  expect(fetchMock.mock.calls[1][0]).toBe('https://sns-img-hw.xhscdn.com/image.png');
});
it('bounds redirect loops', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/loop' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchRemote('https://sns-img-hw.xhscdn.com/loop', {})).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(6);
});
