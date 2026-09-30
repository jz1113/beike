import { withModelRoute } from './modelRoute';
import { withFallbackOrder } from './fallbackOrder';

import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { getClientAccessToken, syncAppTokenCookie } from '@client/shared/api/apiToken';
import { getWorkspaceSecret, syncWorkspaceCookie } from '@client/shared/api/workspaceClient';
import { getApiBase, resolveApiUrl } from '@client/shared/api/apiBase';

export { getClientAccessToken, setClientAccessToken, syncAppTokenCookie } from '@client/shared/api/apiToken';

let mediaSession: { exp: number; sig: string } | null = null;
const mediaSessionListeners = new Set<() => void>();
export function hasMediaSession() {
  return Boolean(mediaSession);
}
export function subscribeMediaSession(listener: () => void) {
  mediaSessionListeners.add(listener);
  return () => { mediaSessionListeners.delete(listener); };
}
export function setMediaSession(value: { exp: number; sig: string } | undefined) {
  if (value) {
    mediaSession = value;
    mediaSessionListeners.forEach((listener) => listener());
  }
}

/**
 * 为无法自定义 Header 的媒体标签生成代理 URL。
 * 优先依赖已同步的 app_token Cookie；不再附加长期 access token query。
 */
export function proxyMediaUrl(
  rawUrl?: string | null,
  opts?: { asVideo?: boolean; thumb?: boolean; width?: number }
): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return rawUrl;
  }
  if (rawUrl.startsWith('/storage')) {
    const base = getApiBase();
    return base ? `${base}${rawUrl}` : rawUrl;
  }
  if (rawUrl.startsWith('/')) {
    return rawUrl;
  }
  syncAppTokenCookie();
  syncWorkspaceCookie();
  const videoFlag = opts?.asVideo ? '&as=video' : '';
  const thumbFlag = opts?.thumb ? '&thumb=1' : '';
  const widthFlag = opts?.width ? `&w=${opts.width}` : '';
  const signed = mediaSession ? `&exp=${mediaSession.exp}&sig=${mediaSession.sig}` : '';
  const path = `/api/system/proxy-image?url=${encodeURIComponent(rawUrl)}${videoFlag}${thumbFlag}${widthFlag}${signed}`;
  const base = resolveApiUrl(path);
  return typeof base === 'string' ? base : path;
}

export function apiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  if (!headers.has('x-app-token')) {
    headers.set('x-app-token', getClientAccessToken());
  }
  if (!headers.has('x-workspace-token')) {
    const workspace = getWorkspaceSecret();
    if (workspace) headers.set('x-workspace-token', workspace);
  }
  const storage = getGatewayClientHeaders();
  Object.entries(storage).forEach(([k, v]) => {
    if (!headers.has(k)) headers.set(k, v);
  });
  return headers;
}

/** 统一带鉴权的浏览器 fetch。 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  init?.signal?.throwIfAborted();
  syncAppTokenCookie();
  syncWorkspaceCookie();

  const headers = apiHeaders(init?.headers);
  if (init?.body instanceof FormData && headers.has('Content-Type')) {
    headers.delete('Content-Type');
  }
  return fetch(resolveApiUrl(input), { ...withModelRoute(input, withFallbackOrder(input, init)), headers });
}

export interface ClientStorageConfig {
  enabled: boolean;
  persistResults: boolean;
  provider: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

/** 读取设置页保存在本机的对象存储配置。storage_enabled 表示成品也上传 OSS。 */
export function readClientStorageConfig(): ClientStorageConfig {
  const read = (key: string) => {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  };
  const provider = read('storage_provider');
  const providers: readonly string[] = ['r2', 'oss', 'cos', 's3', 'minio', 'supabase'];
  return {
    enabled: true,
    persistResults: read('storage_enabled') === 'true',
    provider: providers.includes(provider) ? provider as ClientStorageConfig['provider'] : 'oss',
    accountId: read('storage_account_id'),
    endpoint: read('storage_endpoint'),
    accessKeyId: read('storage_access_key_id'),
    secretAccessKey: read('storage_secret_access_key'),
    bucketName: read('storage_bucket_name'),
    publicDomain: read('storage_public_domain'),
  };
}

export function storageConfigHeaders(): Record<string, string> {
  return { 'x-storage-config': JSON.stringify(readClientStorageConfig()) };
}
