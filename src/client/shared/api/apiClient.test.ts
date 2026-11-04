import { afterEach, expect, it, vi } from 'vitest';
import { proxyMediaUrl, storageConfigHeaders } from './apiClient';

afterEach(() => vi.unstubAllGlobals());

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

it('streams remote audio through the media proxy even when a signed URL has no extension', () => {
  const source = 'https://example.com/signed-media?id=voice';
  const output = proxyMediaUrl(source, { asAudio: true });
  const parsed = new URL(output, 'https://app.example.com');
  expect(parsed.pathname).toBe('/api/system/proxy-image');
  expect(parsed.searchParams.get('url')).toBe(source);
  expect(parsed.searchParams.get('as')).toBe('audio');
  expect(proxyMediaUrl('/storage/sample.wav', { asAudio: true })).toBe('/storage/sample.wav');
});
