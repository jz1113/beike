import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { apiHeaders, getClientAccessToken, proxyMediaUrl, readClientStorageConfig, setClientAccessToken, storageConfigHeaders, syncAppTokenCookie } from './apiClient';

const { apiFetch, saveToDownloadDir } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  saveToDownloadDir: vi.fn(async () => 'browser'),
}));
vi.mock('@client/shared/api/apiClient', async (original) => ({
  ...await original<typeof import('@client/shared/api/apiClient')>(),
  apiFetch,
}));
vi.mock('../media/saveDownload', () => ({ saveToDownloadDir }));

const response = (body: unknown) => Response.json({ success: true, ...body as object });

beforeEach(() => {
  vi.resetModules();
  apiFetch.mockReset();
  saveToDownloadDir.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('global asset library cache', () => {
  it('loads paginated slim assets and enriches fullPrompts with category names', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('view=organization')) {
        return Promise.resolve(response({ categories: [{ id: 'cat-1', name: '女装', parentId: null, position: 0 }] }));
      }
      return Promise.resolve(response({
        fullPrompts: [{ id: 'group-7', displayNumber: 7, productCategoryIds: '["cat-1"]' }],
        hasMore: false,
      }));
    });
    const cache = await import('./assetLibraryCache');
    const global = await cache.getGlobalAssetLibrary();
    expect(global.fullPrompts[0]).toMatchObject({ id: 'group-7', productCategoryNames: ['女装'] });
  });

  it('retries a global request invalidated in flight instead of committing stale rows', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstSlim = new Promise<Response>(resolve => { resolveFirst = resolve; });
    let callCount = 0;
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('view=organization')) return Promise.resolve(response({ categories: [] }));
      callCount += 1;
      if (callCount === 1) return firstSlim;
      return Promise.resolve(response({ fullPrompts: [{ id: 'group-new' }], hasMore: false }));
    });
    const cache = await import('./assetLibraryCache');
    const onInvalidated = vi.fn();
    const unsubscribe = cache.subscribeAssetInvalidation(onInvalidated);
    const loading = cache.getGlobalAssetLibrary();
    cache.invalidateGlobalAssetCache();
    expect(onInvalidated).toHaveBeenCalledOnce();
    unsubscribe();
    resolveFirst(response({ fullPrompts: [{ id: 'group-old' }], hasMore: false }));
    const global = await loading;
    expect(global.fullPrompts.map(item => item.id)).toEqual(['group-new']);
  });

  it('fetches individual asset detail by id', async () => {
    apiFetch.mockResolvedValueOnce(response({ item: { id: 'group-7', reversePromptZh: '完整提示词' } }));
    const cache = await import('./assetLibraryCache');
    await expect(cache.fetchAssetDetail('full_prompt', 'group-7')).resolves.toMatchObject({ id: 'group-7', reversePromptZh: '完整提示词' });
  });
});

it('exports same-origin canvas media locally while keeping remote storage URLs unchanged', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
  const zip = new JSZip();
  zip.file('image.png', new Uint8Array([1, 2, 3]));
  apiFetch.mockResolvedValue(new Response(await zip.generateAsync({ type: 'arraybuffer' }), {
    headers: { 'Content-Type': 'application/zip', 'X-Export-Total': '2', 'X-Export-Succeeded': '1', 'X-Export-Failed': '1' },
  }));
  const { exportZipDownload } = await import('./exportZipDownload');
  const payload = {
    images: [
      { url: 'https://app.example/storage/local/result.png?version=1', filename: 'result.png' },
      { url: 'https://remote.example/storage/result.mp4', filename: 'result.mp4' },
    ],
  };
  const result = await exportZipDownload(payload, 'media.zip', vi.fn());
  const submitted = JSON.parse(String(apiFetch.mock.calls[0][1]?.body));
  expect(submitted.images[0].url).toBe('/storage/local/result.png?version=1');
  expect(submitted.images[1].url).toBe(payload.images[1].url);
  expect(payload.images[0].url).toBe('https://app.example/storage/local/result.png?version=1');
  expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1, partial: true });
  expect(saveToDownloadDir).toHaveBeenCalledOnce();
});

describe('apiClient storage headers, token lifecycle and media proxy', () => {
  it('sends Chinese storage prefixes as valid HTTP headers without changing the configuration', () => {
    const settings: Record<string, string> = {
      storage_provider: 'oss',
      storage_bucket_name: 'reference-bucket',
      storage_api_prefix: '上传/',
      storage_materials_prefix: '参考素材/🎬/',
    };
    vi.stubGlobal('localStorage', { getItem: (key: string) => settings[key] ?? null });

    const headers = new Headers(storageConfigHeaders());
    const config = JSON.parse(headers.get('x-storage-config')!);
    expect(config.apiPrefix).toBe('上传/');
    expect(config.materialsPrefix).toBe('参考素材/🎬/');
    expect(config.bucketName).toBe('reference-bucket');
  });

  it('preserves all supported object storage providers in readClientStorageConfig', () => {
    for (const provider of ['oss', 'qiniu', 'cloudinary', 'cos', 'r2', 's3', 'minio', 'supabase'] as const) {
      vi.stubGlobal('localStorage', { getItem: (key: string) => (key === 'storage_provider' ? provider : null) });
      expect(readClientStorageConfig().provider).toBe(provider);
    }
    vi.stubGlobal('localStorage', { getItem: () => 'unknown-provider' });
    expect(readClientStorageConfig().provider).toBe('oss');
  });

  it('leaves production authentication to the browser cookie and preserves explicit headers', () => {
    vi.stubEnv('PROD', true);
    const writeCookie = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('document', {
      get cookie() { return 'app_token=stale-readable-cookie'; },
      set cookie(value: string) { writeCookie(value); },
    });

    syncAppTokenCookie();
    expect(writeCookie).not.toHaveBeenCalled();
    expect(apiHeaders().has('x-app-token')).toBe(false);
    expect(apiHeaders({ 'x-app-token': 'explicit-token' }).get('x-app-token')).toBe('explicit-token');
  });

  it('does not overwrite expired token metadata when syncAppTokenCookie runs before getClientAccessToken', () => {
    const store = new Map<string, string>();
    let cookieJar = 'app_token=stale-token';
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      get cookie() { return cookieJar; },
      set cookie(val: string) { cookieJar = val; },
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => { store.set(key, val); },
      removeItem: (key: string) => { store.delete(key); },
    });

    store.set('app_token_meta_expires_at', '1000');
    syncAppTokenCookie();
    expect(store.has('app_token_meta_expires_at')).toBe(false);
    expect(cookieJar).toContain('Max-Age=0');

    store.set('app_token_meta_expires_at', '1000');
    expect(getClientAccessToken()).toBe('');

    setClientAccessToken('fresh-token');
    const recordedExpiry = Number(store.get('app_token_meta_expires_at'));
    expect(recordedExpiry).toBeGreaterThan(Date.now());
    syncAppTokenCookie();
    expect(Number(store.get('app_token_meta_expires_at'))).toBe(recordedExpiry);
  });

  it('streams remote audio through the media proxy even when a signed URL has no extension', () => {
    const source = 'https://example.com/signed-media?id=voice';
    const output = proxyMediaUrl(source, { asAudio: true });
    const parsed = new URL(output, 'https://app.example.com');
    expect(parsed.pathname).toBe('/api/system/proxy-image');
    expect(parsed.searchParams.get('url')).toBe(source);
    expect(parsed.searchParams.get('as')).toBe('audio');
    expect(proxyMediaUrl('/storage/sample.wav', { asAudio: true })).toBe('/storage/sample.wav');
  });

  it('keeps external storage media on its original host while normalizing only workspace storage', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.com' } });
    for (const source of ['https://cdn.example.com/storage/result.png?signature=abc', 'https://cdn.example.com/storage/result.mp4?signature=abc']) {
      const output = new URL(proxyMediaUrl(source), 'https://app.example.com');
      expect(output.pathname).toBe('/api/system/proxy-image');
      expect(output.searchParams.get('url')).toBe(source);
    }
    expect(proxyMediaUrl('https://app.example.com/storage/result.png?v=2#preview')).toBe('/storage/result.png?v=2#preview');
  });
});
