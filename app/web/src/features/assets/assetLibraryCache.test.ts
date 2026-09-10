import { beforeEach, expect, it, vi } from 'vitest';
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/apiClient', () => ({ apiFetch: fetchMock }));
beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); });
it('refetches after invalidation during an in-flight request', async () => {
  let finish!: (res: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { finish = r; }));
  fetchMock.mockResolvedValueOnce(Response.json({ success: true, fullPrompts: [{ id: 'fresh' }] }));
  const cache = await import('./assetLibraryCache');
  const first = cache.getGlobalAssetLibrary();
  cache.invalidateGlobalAssetCache();
  const forced = cache.getGlobalAssetLibrary(true);
  finish(Response.json({ success: true, fullPrompts: [{ id: 'stale' }] }));
  await Promise.all([first, forced]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(cache.getCachedAssetsSync('full_prompt')).toEqual([{ id: 'fresh' }]);
});
it('loads additional pages and propagates network failures', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ success: true, hasMore: true, actions: [{ id: 'a' }] }));
  fetchMock.mockResolvedValueOnce(Response.json({ success: true, hasMore: false, actions: [{ id: 'b' }] }));
  const cache = await import('./assetLibraryCache');
  await cache.getGlobalAssetLibrary();
  expect(cache.getCachedAssetsSync('action')).toHaveLength(2);
  cache.invalidateGlobalAssetCache();
  fetchMock.mockResolvedValueOnce(Response.json({ success: false }, { status: 500 }));
  await expect(cache.getGlobalAssetLibrary(true)).rejects.toThrow();
});
