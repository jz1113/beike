import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 Tauri 桌面环境
vi.mock('@/lib/desktopRuntime', () => ({
  isTauriDesktop: () => true,
}));

// 模拟 Tauri invoke
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

import {
  persistAiGatewayConfig,
  persistWanbangConfig,
  persistStorageConfig,
  CredentialPersistError,
} from '@/lib/persistDesktopSecrets';

describe('persistDesktopSecrets — 密钥仅入 Keychain (PR1 Critical)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('persistAiGatewayConfig 不应将密钥写入 localStorage', async () => {
    invokeMock.mockResolvedValueOnce(undefined); // credential_set
    invokeMock.mockResolvedValueOnce(undefined); // save_desktop_env
    await persistAiGatewayConfig('https://api.openai.com/v1', 'sk-very-secret');
    const stored = window.localStorage.getItem('ai_api_key');
    expect(stored).toBeNull();
    // 仅 baseUrl 允许保留
    expect(window.localStorage.getItem('ai_base_url')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('persistWanbangConfig 不应将密钥写入 localStorage', async () => {
    invokeMock.mockResolvedValue(undefined);
    await persistWanbangConfig('wb-key', 'wb-secret');
    expect(window.localStorage.getItem('wanbang_api_key')).toBeNull();
    expect(window.localStorage.getItem('wanbang_api_secret')).toBeNull();
    // 验证 credential_set 被调用两次
    const calls = invokeMock.mock.calls.filter(
      (c) => c[0] === 'credential_set',
    );
    expect(calls.length).toBe(2);
  });

  it('persistStorageConfig 不应将 secretAccessKey 写入 localStorage', async () => {
    invokeMock.mockResolvedValue(undefined);
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
    expect(window.localStorage.getItem('storage_secret_access_key')).toBeNull();
    expect(window.localStorage.getItem('storage_access_key_id')).toBe('AKID-public');
    expect(window.localStorage.getItem('storage_bucket_name')).toBe('bkt');
  });

  it('Keychain 写入失败时应抛出 CredentialPersistError', async () => {
    invokeMock.mockRejectedValueOnce(new Error('Keychain locked'));
    invokeMock.mockResolvedValueOnce(undefined); // save_desktop_env (后续)
    await expect(
      persistAiGatewayConfig('https://api.openai.com/v1', 'sk-fail'),
    ).rejects.toBeInstanceOf(CredentialPersistError);
    // 关键：失败后密钥绝不应泄漏到 localStorage
    expect(window.localStorage.getItem('ai_api_key')).toBeNull();
  });
});
