// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGatewayUser } from '../hooks/useGatewayUser';
import { credentialGet, clearCredentialMemoryCache } from '../../../lib/credentialClient';

// 模拟 API 请求
vi.mock('../../../lib/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      user: {
        id: '88434',
        username: 'test_user',
        displayName: '测试用户',
        quota: 1000000,
        usedQuota: 200000,
        quotaFormatted: 100,
        quotaRmb: 120,
        usedQuotaFormatted: 20,
        usedQuotaRmb: 24,
        remainingPercent: 80,
        requestCount: 42,
        group: 'default',
      },
    }),
  }),
}));

describe('useGatewayUser 凭证永久保存与双重持久化', () => {
  beforeEach(() => {
    clearCredentialMemoryCache();
    window.localStorage.clear();
  });

  it('保存凭证时立即永久写入 localStorage 与凭证存储，返回 true', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useGatewayUser({ isOpen: true, showToast }));

    let saveSuccess = false;
    await act(async () => {
      saveSuccess = await result.current.saveCredentials('88434', 'sys_token_secret_123');
    });

    expect(saveSuccess).toBe(true);
    expect(result.current.userId).toBe('88434');
    expect(result.current.systemToken).toBe('sys_token_secret_123');

    // 验证本地持久化
    expect(window.localStorage.getItem('gateway_user_id')).toBe('88434');
    const storedToken = await credentialGet('gateway_system_token');
    expect(storedToken).toBe('sys_token_secret_123');
  });

  it('再次挂载能完整回显已持久化的凭据与用户 ID', async () => {
    window.localStorage.setItem('gateway_user_id', '88434');
    window.localStorage.setItem('gateway_system_token', 'sys_token_secret_123');

    const { result } = renderHook(() => useGatewayUser({ isOpen: true }));

    // 等待初始化 effect 完成
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.userId).toBe('88434');
    expect(result.current.systemToken).toBe('sys_token_secret_123');
  });
});
