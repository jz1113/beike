/** 客户端网关非敏感配置（密钥由 sidecar .env / Keychain 提供，不再随请求发送） */
export function getGatewayClientOverrides(): { customBaseUrl?: string } {
  if (typeof window === 'undefined') return {};
  const url = localStorage.getItem('ai_base_url')?.trim();
  return url ? { customBaseUrl: url } : {};
}

export function getGatewayClientHeaders(): Record<string, string> {
  const { customBaseUrl } = getGatewayClientOverrides();
  return customBaseUrl ? { 'x-custom-base-url': customBaseUrl } : {};
}
