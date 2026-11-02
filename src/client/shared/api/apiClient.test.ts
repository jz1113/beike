import { afterEach, expect, it, vi } from 'vitest';
import { storageConfigHeaders } from './apiClient';

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
