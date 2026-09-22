import { domainEnv } from './runtime';

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  const ipv4 = host.startsWith('::ffff:') ? host.slice(7) : host;
  const parts = ipv4.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function isSafeCustomGatewayBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 绘图/视觉网关凭证：生产默认忽略客户端 customBaseUrl，防止 SSRF。
 * 需要例外时设置 ALLOW_CUSTOM_BASE_URL=true。
 */
export function allowClientCustomBaseUrl(): boolean {
  return (
    domainEnv('DESKTOP_SHELL') === '1' ||
    domainEnv('NODE_ENV') !== 'production' ||
    domainEnv('ALLOW_CUSTOM_BASE_URL') === 'true'
  );
}

/** 生产网页不把服务器环境变量密钥当作所有人的默认密钥。 */
export function allowServerSecretFallback(): boolean {
  return domainEnv('DESKTOP_SHELL') === '1' || domainEnv('NODE_ENV') !== 'production';
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '');
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
  const ignoredClientBase = Boolean(clientBase) && (!allowClientCustomBaseUrl() || !isSafeCustomGatewayBaseUrl(clientBase));
  const customBaseUrl = allowClientCustomBaseUrl() && isSafeCustomGatewayBaseUrl(clientBase) ? clientBase : '';

  if (!allowClientCustomBaseUrl() && customApiKey && clientBase && normalizeBase(clientBase) !== normalizeBase(defaults.baseUrl)) {
    throw new Error('不会将该密钥发往未配置的独立网关');
  }

  const baseUrl = (customBaseUrl ? normalizeBase(customBaseUrl) : normalizeBase(defaults.baseUrl)) || defaults.baseUrl;
  const usingThirdParty = customBaseUrl && normalizeBase(customBaseUrl) !== normalizeBase(defaults.baseUrl);
  const apiKey = customApiKey || (usingThirdParty ? '' : (allowServerSecretFallback() ? defaults.apiKey : ''));
  const keyFrom = bodyKey ? 'body' : headerKey ? 'header' : 'server';

  return { baseUrl, apiKey, ignoredClientBase, keyFrom };
}

