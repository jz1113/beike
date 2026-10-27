import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch }));

const full = { id: 'group-7', displayNumber: 7, sourceImages: '["one.jpg","two.jpg","three.jpg","four.jpg"]' };
const response = (body: unknown) => Response.json({ success: true, ...body as object });

beforeEach(() => {
  vi.resetModules();
  apiFetch.mockReset();
});

describe('asset library preview cache', () => {
  it('keeps complete previews when a late slim preload finishes', async () => {
    let resolveSlim!: (value: Response) => void;
    const slimResponse = new Promise<Response>(resolve => { resolveSlim = resolve; });
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('slim=1')) return slimResponse;
      if (url.includes('view=organization')) return Promise.resolve(response({ categories: [] }));
      return Promise.resolve(response({ items: [full], total: 1 }));
    });
    const cache = await import('./assetLibraryCache');
    const preload = cache.getGlobalAssetLibrary();
    await cache.getCategoryAssetLibrary('full_prompt');
    resolveSlim(response({ fullPrompts: [{ id: full.id, displayNumber: 7 }], hasMore: false }));
    const global = await preload;
    expect(global.fullPrompts[0].sourceImages).toBeUndefined();
    expect(cache.getCachedAssetsSync('full_prompt')[0]).toEqual(full);
  });

  it('refreshes complete rows after invalidation without losing them to a global refresh', async () => {
    let current = full;
    apiFetch.mockImplementation((url: string) => Promise.resolve(response(
      url.includes('view=organization') ? { categories: [] }
        : url.includes('slim=1') ? { fullPrompts: [{ id: current.id }], hasMore: false }
          : { items: [current], total: 1 },
    )));
    const cache = await import('./assetLibraryCache');
    await cache.getCategoryAssetLibrary('full_prompt');
    current = { ...full, sourceImages: '["updated.jpg"]' };
    cache.invalidateGlobalAssetCache();
    await Promise.all([cache.getGlobalAssetLibrary(), cache.getCategoryAssetLibrary('full_prompt')]);
    expect(cache.getCachedAssetsSync('full_prompt')[0]).toEqual(current);
    await cache.getCategoryAssetLibrary('full_prompt');
    expect(apiFetch.mock.calls.filter(([url]) => String(url).includes('pageSize=100'))).toHaveLength(2);
  });

  it('retries a category request invalidated in flight instead of committing obsolete rows', async () => {
    let resolveOld!: (value: Response) => void;
    const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
    const updated = { ...full, sourceImages: '["new.jpg"]' };
    apiFetch.mockReturnValueOnce(oldResponse).mockResolvedValue(response({ items: [updated], total: 1 }));
    const cache = await import('./assetLibraryCache');
    const loading = cache.getCategoryAssetLibrary('full_prompt');
    cache.invalidateGlobalAssetCache();
    resolveOld(response({ items: [full], total: 1 }));
    await loading;
    expect(cache.getCachedAssetsSync('full_prompt')[0]).toEqual(updated);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
