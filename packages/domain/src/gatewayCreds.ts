/**
 * 绘图/视觉网关凭证：生产默认忽略客户端 customBaseUrl，防止 SSRF。
 * 需要例外时设置 ALLOW_CUSTOM_BASE_URL=true。
 */
export function allowClientCustomBaseUrl(): boolean {
  return (
    process.env.DESKTOP_SHELL === '1' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_CUSTOM_BASE_URL === 'true'
  );
}

export function resolveGatewayCreds(
  req: Request,
  body: { customBaseUrl?: string; customApiKey?: string } | undefined,
  defaults: { baseUrl: string; apiKey: string }
): { baseUrl: string; apiKey: string; ignoredClientBase: boolean; keyFrom: 'header' | 'body' | 'server' } {
  const headerKey = req.headers.get('x-custom-api-key')?.trim() || '';
  const bodyKey = body?.customApiKey?.trim() || '';
  const customApiKey = bodyKey || headerKey;

  const headerBase = req.headers.get('x-custom-base-url')?.trim() || '';
  const bodyBase = body?.customBaseUrl?.trim() || '';
  const clientBase = bodyBase || headerBase;
  const ignoredClientBase = Boolean(clientBase) && !allowClientCustomBaseUrl();
  const customBaseUrl = allowClientCustomBaseUrl() ? clientBase : '';

  const baseUrl = (customBaseUrl ? customBaseUrl.replace(/\/+$/, '') : defaults.baseUrl.replace(/\/+$/, '')) || defaults.baseUrl;
  const apiKey = customApiKey || defaults.apiKey;
  const keyFrom = bodyKey ? 'body' : headerKey ? 'header' : 'server';

  return { baseUrl, apiKey, ignoredClientBase, keyFrom };
}
