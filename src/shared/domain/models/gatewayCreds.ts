import { DEEPSEEK_BASE_URL, isDeepSeekRoute, deepSeekModel } from './deepseek';
import { domainEnv } from '../core/runtime';
import { normalizeGatewayBaseUrl } from './gatewayUrl';

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  const ipv4 = host.startsWith('::ffff:') ? host.slice(7) : host;
  const parts = ipv4.split('..').map(Number);
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

/** Explicitly approved HTTP bridge: only a literal, globally routable IPv4 address. */
export function isPublicHttpGatewayIpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash) return false;
    const parts = url.hostname.split('..').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0 || b === 88)) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return !(a === 192 && b === 0 && c === 2);
  } catch {
    return false;
  }
}

/**
 * 非生产环境，或显式打开 ALLOW_CUSTOM_BASE_URL 时，调用方可以放宽地址检查。
 * 生产网页是否采用浏览器传来的地址，由 isSafeCustomGatewayBaseUrl 决定。
 */
export function allowClientCustomBaseUrl(): boolean {
  return (
    domainEnv('NODE_ENV') !== 'production' ||
    domainEnv('ALLOW_CUSTOM_BASE_URL') === 'true'
  );
}

export class GatewayBaseUrlError extends Error {
  readonly status = 400;
  constructor(message = '当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。') {
    super(message);
    this.name = 'GatewayBaseUrlError';
  }
}

/** 生产网页不把服务器环境变量密钥当作所有人的默认密钥。 */
export function allowServerSecretFallback(): boolean {
  return domainEnv('NODE_ENV') !== 'production';
}

function normalizeBase(url: string): string {
  return normalizeGatewayBaseUrl(url);
}

export function resolveGatewayCreds(
  req: Request,
  body: { model?: string; customBaseUrl?: string; customApiKey?: string; apiFormat?: string; allowInsecureHttp?: boolean } | undefined,
  defaults: { baseUrl: string; apiKey: string }
): { baseUrl: string; apiKey: string; ignoredClientBase: boolean; keyFrom: 'header' | 'body' | 'server' } {
  if (isDeepSeekRoute(body?.model || '')) {
    if (!deepSeekModel(body!.model!)) throw new GatewayBaseUrlError('此 DeepSeek 官方模型尚未适配');
    if (body?.customBaseUrl && normalizeBase(body.customBaseUrl) !== DEEPSEEK_BASE_URL) throw new GatewayBaseUrlError('DeepSeek 官方模型只能使用官方接口地址');
    return { baseUrl: DEEPSEEK_BASE_URL, apiKey: body?.customApiKey?.trim() || '', ignoredClientBase: false, keyFrom: 'body' };
  }
  const headerKey = req.headers.get('x-custom-api-key')?.trim() || '';
  const bodyKey = body?.customApiKey?.trim() || '';
  const customApiKey = bodyKey || headerKey;

  const headerBase = req.headers.get('x-custom-base-url')?.trim() || '';
  const bodyBase = body?.customBaseUrl?.trim() || '';
  const clientBase = bodyBase || headerBase;
  const insecureApproved = body?.apiFormat === 'openai-responses'
    && body.allowInsecureHttp === true
    && isPublicHttpGatewayIpUrl(clientBase);
  const clientBaseSafe = Boolean(clientBase) && (allowClientCustomBaseUrl() || isSafeCustomGatewayBaseUrl(clientBase) || insecureApproved);
  if (clientBase && !clientBaseSafe) throw new GatewayBaseUrlError();
  const ignoredClientBase = false;
  const customBaseUrl = clientBaseSafe ? clientBase : '';

  const baseUrl = (customBaseUrl ? normalizeBase(customBaseUrl) : normalizeBase(defaults.baseUrl)) || defaults.baseUrl;
  const usingThirdParty = customBaseUrl && normalizeBase(customBaseUrl) !== normalizeBase(defaults.baseUrl);
  const apiKey = insecureApproved ? customApiKey
    : customApiKey || (usingThirdParty ? '' : (allowServerSecretFallback() ? defaults.apiKey : ''));
  const keyFrom = bodyKey ? 'body' : headerKey ? 'header' : 'server';

  return { baseUrl, apiKey, ignoredClientBase, keyFrom };
}
