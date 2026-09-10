import { describe, it, expect, beforeEach } from 'vitest';
import { getClientAccessToken, setClientAccessToken } from '@/lib/apiToken';

describe('apiToken — 安全加固 (PR1)', () => {
  beforeEach(() => {
    // 清空 localStorage 与 cookie
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.cookie = 'app_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  });

  it('不读取历史遗留的 localStorage 明文 token', () => {
    window.localStorage.setItem('app_access_token', 'should-be-ignored');
    const token = getClientAccessToken();
    // 应返回空（cookie 未设且 meta 未设）而非遗留值
    expect(token).not.toBe('should-be-ignored');
  });

  it('token 过期后返回空串', () => {
    // 直接写入过期 meta
    const expiresAt = Date.now() - 1000;
    window.localStorage.setItem('app_token_meta_expires_at', String(expiresAt));
    document.cookie = `app_token=stale-token; path=/; Max-Age=31536000`;
    const token = getClientAccessToken();
    expect(token).toBe('');
  });

  it('未过期时返回 cookie 中的 token', () => {
    document.cookie = `app_token=valid-token; path=/; Max-Age=31536000`;
    window.localStorage.setItem(
      'app_token_meta_expires_at',
      String(Date.now() + 60_000),
    );
    const token = getClientAccessToken();
    expect(token).toBe('valid-token');
  });

  it('setClientAccessToken 应仅写入过期元数据，不写入 localStorage 明文', () => {
    setClientAccessToken('new-token');
    const legacy = window.localStorage.getItem('app_access_token');
    expect(legacy).toBeNull();
    const meta = window.localStorage.getItem('app_token_meta_expires_at');
    expect(meta).not.toBeNull();
  });
});
