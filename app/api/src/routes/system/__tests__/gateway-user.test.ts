import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as gatewayUser from '../gateway-user';

describe('gateway-user route', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('缺少 userId 时返回 400 错误', async () => {
    const req = new Request('http://localhost/api/system/gateway-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemToken: 'test-token',
      }),
    });

    const res = await gatewayUser.POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('用户 ID');
  });

  it('缺少 systemToken 时返回 400 错误', async () => {
    const req = new Request('http://localhost/api/system/gateway-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '10086',
      }),
    });

    const res = await gatewayUser.POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('系统访问令牌');
  });

  it('成功拉取时，正确换算 500,000 Quota 为 1 算力并折算人民币', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: 10086,
          username: 'azhuo_designer',
          display_name: '阿卓',
          quota: 25000000, // 25,000,000 / 500,000 = 50 算力
          used_quota: 5000000, // 5,000,000 / 500,000 = 10 算力
          request_count: 120,
          group: 'vip',
        },
      }),
    }) as any;

    const req = new Request('http://localhost/api/system/gateway-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://ai.comfly.org',
        userId: '10086',
        systemToken: 'sys-tok-123456',
      }),
    });

    const res = await gatewayUser.POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user).toBeDefined();
    expect(json.user.id).toBe(10086);
    expect(json.user.displayName).toBe('阿卓');
    expect(json.user.quotaFormatted).toBe(50); // 50 算力
    expect(json.user.quotaRmb).toBe(60); // 50 * 1.2 = 60 元
    expect(json.user.usedQuotaFormatted).toBe(10); // 10 算力
    expect(json.user.usedQuotaRmb).toBe(12); // 10 * 1.2 = 12 元
    expect(json.user.remainingPercent).toBe(83); // 25/(25+5) ≈ 83%
    expect(json.user.group).toBe('vip');

    // 验证发往远程网关的 Header
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://ai.comfly.org/api/user/self',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sys-tok-123456',
          'New-API-User': '10086',
        }),
      })
    );
  });

  it('网关返回 401 时映射为清晰的系统令牌错误提示', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        message: 'invalid token',
      }),
    }) as any;

    const req = new Request('http://localhost/api/system/gateway-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://ai.comfly.org',
        userId: '10086',
        systemToken: 'expired-token',
      }),
    });

    const res = await gatewayUser.POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('系统访问令牌');
  });
});
