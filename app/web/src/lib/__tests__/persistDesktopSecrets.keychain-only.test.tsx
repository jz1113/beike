import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

import {
  persistAiGatewayConfig,
  persistWanbangConfig,
  persistStorageConfig,
} from '@/lib/persistDesktopSecrets';
import { apiFetch } from '@/lib/apiClient';

describe('persistDesktopSecrets — Web 本地持久化', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true } as Response);
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('persistAiGatewayConfig 将密钥写入 localStorage，并通知服务端', async () => {
    await persistAiGatewayConfig('https://api.openai.com/v1', 'sk-very-secret');
    expect(window.localStorage.getItem('ai_api_key')).toBe('sk-very-secret');
    expect(window.localStorage.getItem('ai_base_url')).toBe('https://api.openai.com/v1');
    expect(apiFetch).toHaveBeenCalled();
  });

  it('persistWanbangConfig 将密钥写入 localStorage', async () => {
    await persistWanbangConfig('wb-key', 'wb-secret');
    expect(window.localStorage.getItem('wanbang_api_key')).toBe('wb-key');
    expect(window.localStorage.getItem('wanbang_api_secret')).toBe('wb-secret');
  });

  it('persistStorageConfig 保留非敏感配置，并将 secret 写入凭证存储', async () => {
    await persistStorageConfig({
      enabled: true,
      provider: 'r2',
      accountId: 'acct',
      endpoint: 'https://r2.example.com',
      accessKeyId: 'AKID-public',
      secretAccessKey: 'super-secret',
      bucketName: 'bkt',
      publicDomain: 'cdn.example.com',
    });
    expect(window.localStorage.getItem('storage_secret_access_key')).toBe('super-secret');
    expect(window.localStorage.getItem('storage_access_key_id')).toBe('AKID-public');
    expect(window.localStorage.getItem('storage_bucket_name')).toBe('bkt');
  });
});
