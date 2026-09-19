import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(async () => {}), fallback: vi.fn(), api: vi.fn(), save: vi.fn() }));
vi.mock('../idbMediaCache', () => ({ getDerived: mocks.get, putDerived: mocks.put, fetchWithDerivedCache: mocks.fallback }));
vi.mock('../apiClient', () => ({ apiFetch: mocks.api, proxyMediaUrl: (url: string) => url }));
vi.mock('../desktopDownload', () => ({ saveToDownloadDir: mocks.save }));
import { downloadMedia, downloadMediaOrOpen } from '../downloadMedia';
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('refetches an unreadable cached blob before saving', async () => {
  const stale = new Blob(['x'.repeat(300)], { type: 'image/png' });
  vi.spyOn(stale, 'arrayBuffer').mockRejectedValue(new DOMException('Backing file missing', 'NotFoundError'));
  mocks.get.mockResolvedValue(stale);
  mocks.api.mockResolvedValue(new Response('x'.repeat(400), { headers: { 'content-type': 'image/png' } }));
  mocks.save.mockImplementation(async (_name, blob: Blob) => { expect((await blob.arrayBuffer()).byteLength).toBe(400); return 'desktop'; });
  expect(await downloadMedia('https://example.com/recover.png', 'image.png')).toBe('desktop');
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it('rejects truncated downloads and opens the original URL as a fallback', async () => {
  mocks.get.mockResolvedValue(null);
  const partial = () => new Response('x'.repeat(300), { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-299/900' } });
  mocks.api.mockResolvedValue(partial());
  vi.stubGlobal('fetch', vi.fn(async () => partial()));
  mocks.fallback.mockRejectedValue(new Error('unavailable'));
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  expect(await downloadMediaOrOpen('https://example.com/partial.mp4', 'video.mp4')).toBe('browser');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith('https://example.com/partial.mp4', '_blank', 'noopener,noreferrer');
});

it('reads persisted local media without duplicating it in IndexedDB', async () => {
  mocks.api.mockResolvedValue(new Response('x'.repeat(400), { headers: { 'content-type': 'image/png' } }));
  mocks.save.mockResolvedValue('desktop');
  await downloadMedia('/storage/generated/images/local/perf-test.png', 'image.png');
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
