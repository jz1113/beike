import { describe, it, expect, beforeEach } from 'vitest';
import {
  setClientGatewayApiKey,
  setClientGatewayBaseUrl,
  getGatewayClientOverrides,
  getGatewayClientHeaders,
} from '@/lib/gatewayClient';

describe('gatewayClient 凭证缓存与安全隔离 (H3 专项测试)', () => {
  beforeEach(() => {
    localStorage.clear();
    setClientGatewayApiKey(undefined);
    setClientGatewayBaseUrl(undefined);
  });

  it('显式清空 Key（传入空字符串或 null）时，绝不回退到 localStorage 中的历史旧 Key', () => {
    // 模拟旧历史残留
    localStorage.setItem('ai_api_key', 'legacy-stale-key-12345');

    // 用户在界面上清空了 Key
    setClientGatewayApiKey('');

    const overrides = getGatewayClientOverrides();
    expect(overrides.customApiKey).toBeUndefined();

    const headers = getGatewayClientHeaders();
    expect(headers['x-custom-api-key']).toBeUndefined();
  });

  it('显式传入 null 时同样绝不回退 localStorage', () => {
    localStorage.setItem('ai_api_key', 'legacy-stale-key-12345');

    setClientGatewayApiKey(null);

    const overrides = getGatewayClientOverrides();
    expect(overrides.customApiKey).toBeUndefined();
  });

  it('设置新 Key 时应立即生效并覆盖 localStorage', () => {
    localStorage.setItem('ai_api_key', 'old-key');

    setClientGatewayApiKey('  sk-new-valid-key  ');

    const overrides = getGatewayClientOverrides();
    expect(overrides.customApiKey).toBe('sk-new-valid-key');

    const headers = getGatewayClientHeaders();
    expect(headers['x-custom-api-key']).toBe('sk-new-valid-key');
  });

  it('未初始化状态（undefined）下允许回退读取（向后兼容）', () => {
    localStorage.setItem('ai_api_key', 'fallback-key');

    setClientGatewayApiKey(undefined);

    const overrides = getGatewayClientOverrides();
    expect(overrides.customApiKey).toBe('fallback-key');
  });
});
