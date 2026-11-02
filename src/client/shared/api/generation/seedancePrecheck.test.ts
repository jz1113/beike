import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '../apiClient';
import { getGatewayClientHeaders } from '../gatewayClient';
import { persistStorageConfig, STORAGE_CONFIG_CHANGED_EVENT } from '../persistCredentials';
import {
  clearSeedancePrecheckCacheForTests,
  getSeedancePrecheckEntry,
  runSeedancePrecheck,
} from './seedancePrecheck';

vi.mock('../apiClient', () => ({
  apiFetch: vi.fn(),
  readClientStorageConfig: vi.fn(),
  storageConfigHeaders: vi.fn(),
}));
vi.mock('../gatewayClient', () => ({ getGatewayClientHeaders: vi.fn() }));

const storageConfig = {
  enabled: true, persistResults: false, provider: 'oss' as const,
  accountId: '', endpoint: 'https://oss-cn-beijing.aliyuncs.com',
  accessKeyId: 'test-access-key', secretAccessKey: 'test-storage-secret',
  bucketName: 'reference-bucket', publicDomain: '',
};
const video = { url: '/storage/assets/depth.mp4', mediaType: 'video' as const };
const response = (status: 'passed' | 'skipped' | 'rejected', error?: string) => ({
  ok: true,
  json: async () => ({ success: true, results: [{ ...video, status, error }] }),
}) as Response;

describe('seedancePrecheck', () => {
  beforeEach(() => {
    clearSeedancePrecheckCacheForTests();
    vi.resetAllMocks();
    vi.mocked(readClientStorageConfig).mockReturnValue({ ...storageConfig });
    vi.mocked(storageConfigHeaders).mockImplementation(() => ({ 'x-storage-config': JSON.stringify(readClientStorageConfig()) }));
    vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-base-url': 'https://gateway.example.test', 'x-custom-api-key': 'test-gateway-key' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('batches precheck items and caches passed and rejected results', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        results: [
          { url: '/storage/assets/depth.mp4', mediaType: 'video', status: 'passed', assetUri: 'asset://vid-1', durationSec: 6.5 },
          { url: '/storage/assets/persona.png', mediaType: 'image', status: 'rejected', error: '参考图片未通过安全检测' },
        ],
      }),
    } as Response);

    const results = await runSeedancePrecheck([
      { url: '/storage/assets/depth.mp4', mediaType: 'depth-video' },
      { url: '/storage/assets/persona.png', mediaType: 'image' },
    ]);

    expect(results).toHaveLength(2);
    expect(getSeedancePrecheckEntry('/storage/assets/depth.mp4')?.status).toBe('passed');
    expect(getSeedancePrecheckEntry('/storage/assets/persona.png')?.status).toBe('rejected');

    // Second call hits cache without extra network request
    await runSeedancePrecheck([{ url: '/storage/assets/depth.mp4', mediaType: 'video' }]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('sends the saved OSS configuration even when result persistence is disabled', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response('passed'));
    await runSeedancePrecheck([video]);

    const init = vi.mocked(apiFetch).mock.calls[0][1]!;
    expect(JSON.parse(String(init.body)).storageConfig).toEqual(storageConfig);
    expect(JSON.parse(new Headers(init.headers).get('x-storage-config')!)).toEqual(storageConfig);
  });

  it('retries a skipped check instead of permanently caching a configuration or network failure', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response('skipped', '当前未配置对象存储'))
      .mockResolvedValueOnce(response('passed'));
    expect((await runSeedancePrecheck([video]))[0].status).toBe('skipped');
    expect((await runSeedancePrecheck([video]))[0].status).toBe('passed');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('retries after a network failure without changing the saved configuration', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response('passed'));
    expect((await runSeedancePrecheck([video]))[0].status).toBe('skipped');
    expect((await runSeedancePrecheck([video]))[0].status).toBe('passed');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates a previous result after storage configuration changes', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response('rejected')).mockResolvedValueOnce(response('passed'));
    await runSeedancePrecheck([video]);
    vi.mocked(readClientStorageConfig).mockReturnValue({ ...storageConfig, bucketName: 'updated-bucket' });

    expect(getSeedancePrecheckEntry(video.url)).toBeUndefined();
    expect((await runSeedancePrecheck([video]))[0].status).toBe('passed');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps checks scoped to their model and gateway credentials', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response('passed'));
    await runSeedancePrecheck([video], 'model-one');
    await runSeedancePrecheck([video], 'model-two');
    await runSeedancePrecheck([video], 'model-one');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'another-test-key' });
    expect(getSeedancePrecheckEntry(video.url, 'model-one')).toBeUndefined();
    await runSeedancePrecheck([video], 'model-one');
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('does not let an old in-flight configuration error replace a new successful check', async () => {
    let finishOld!: (value: Response) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(response('passed'));
    const oldCheck = runSeedancePrecheck([video]);
    vi.mocked(readClientStorageConfig).mockReturnValue({ ...storageConfig, bucketName: 'updated-bucket' });
    const newResult = await runSeedancePrecheck([video]);
    expect(newResult[0].status).toBe('passed');
    finishOld(response('skipped', '当前未配置对象存储'));
    await oldCheck;
    expect(getSeedancePrecheckEntry(video.url)?.status).toBe('passed');
  });

  it('shares an in-flight check for repeated uses of the same media', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const first = runSeedancePrecheck([video, video]);
    const second = runSeedancePrecheck([video]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]!.body)).items).toEqual([video]);
    finish(response('passed'));
    expect((await first).every(entry => entry.status === 'passed')).toBe(true);
    expect((await second)[0].status).toBe('passed');
  });

  it('announces saved storage changes after all fields commit, so mounted prechecks can rerun', async () => {
    const settings = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => settings.get(key) ?? null,
      setItem: (key: string, value: string) => settings.set(key, value),
      removeItem: (key: string) => settings.delete(key),
    });
    const browser = new EventTarget();
    vi.stubGlobal('window', browser);
    const onSaved = vi.fn(() => {
      expect(settings.get('storage_bucket_name')).toBe(storageConfig.bucketName);
      expect(settings.get('storage_secret_access_key')).toBe(storageConfig.secretAccessKey);
    });
    browser.addEventListener(STORAGE_CONFIG_CHANGED_EVENT, onSaved);

    await persistStorageConfig(storageConfig);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
