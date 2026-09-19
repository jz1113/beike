import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSafeCustomGatewayBaseUrl, resolveGatewayCreds } from './gatewayCreds';

describe('gatewayCreds 安全防护', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('有效拦截私网与云元数据 Base URL', () => {
    expect(isSafeCustomGatewayBaseUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('https://169.254.169.254/v1')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('https://metadata.google.internal/v1')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('https://192.168.1.1/api')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('https://10.0.0.1/api')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('https://100.64.0.1/api')).toBe(false);
    expect(isSafeCustomGatewayBaseUrl('ftp://example.com')).toBe(false);
  });

  it('允许合法的公共 HTTPS 网关', () => {
    expect(isSafeCustomGatewayBaseUrl('https://api.openai.com')).toBe(true);
    expect(isSafeCustomGatewayBaseUrl('https://ai.comfly.org/v1')).toBe(true);
  });

  it('桌面模式下若提供私网 Base URL 应当被强制忽略', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-custom-base-url': 'http://169.254.169.254/v1' },
    });
    const res = resolveGatewayCreds(req, undefined, {
      baseUrl: 'https://default.gateway.com',
      apiKey: 'default-key',
    });
    expect(res.ignoredClientBase).toBe(true);
    expect(res.baseUrl).toBe('https://default.gateway.com');
  });

  it('客户端提供安全的第三方 Base URL 但未提供 Key 时，禁止使用服务端平台 Key', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-custom-base-url': 'https://third-party-ai.example.com/v1' },
    });
    const res = resolveGatewayCreds(req, undefined, {
      baseUrl: 'https://ai.comfly.org',
      apiKey: 'server-secret-drawing-key',
    });
    expect(res.baseUrl).toBe('https://third-party-ai.example.com/v1');
    expect(res.apiKey).toBe(''); // 必须为空，严禁将 server-secret-drawing-key 发往第三方
  });
});

it('does not forward an independent credential to the default host when custom gateways are disabled', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ALLOW_CUSTOM_BASE_URL', 'false');
  try {
    expect(() => resolveGatewayCreds(new Request('http://localhost'), { customBaseUrl: 'https://second.example.com', customApiKey: 'second-secret' }, { baseUrl: 'https://ai.comfly.org', apiKey: 'main-secret' })).toThrow('不会将该密钥');
  } finally { vi.unstubAllEnvs(); }
});
it('allows a credential for the exact configured default gateway in production', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ALLOW_CUSTOM_BASE_URL', 'false');
  try {
    expect(resolveGatewayCreds(new Request('http://localhost'), { customBaseUrl: 'https://ai.comfly.org/', customApiKey: 'main-key' }, { baseUrl: 'https://ai.comfly.org', apiKey: '' }).apiKey).toBe('main-key');
  } finally { vi.unstubAllEnvs(); }
});
