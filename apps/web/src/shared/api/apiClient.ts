
import { getGatewayClientHeaders } from '@/shared/api/gatewayClient';
import { getClientAccessToken, syncAppTokenCookie } from '@/shared/api/apiToken';
import { getWorkspaceSecret, syncWorkspaceCookie } from '@/shared/api/workspaceClient';
import { getApiBase, resolveApiUrl } from '@/shared/api/apiBase';

export { getClientAccessToken, setClientAccessToken, syncAppTokenCookie } from '@/shared/api/apiToken';

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
  syncAppTokenCookie();
  syncWorkspaceCookie();

  const headers = apiHeaders(init?.headers);
  if (init?.body instanceof FormData && headers.has('Content-Type')) {
    headers.delete('Content-Type');
  }
  return fetch(resolveApiUrl(input), { ...init, headers });
}
