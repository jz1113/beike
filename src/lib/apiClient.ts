'use client';

import { getGatewayClientHeaders } from '@/lib/gatewayClient';
import { getClientAccessToken, syncAppTokenCookie } from '@/lib/apiToken';
import { isTauriDesktop, resolveApiUrl } from '@/lib/desktopRuntime';
import { invokeTauriApi } from '@/lib/tauriApi';

export { getClientAccessToken, setClientAccessToken, syncAppTokenCookie } from '@/lib/apiToken';

/**
 * 为无法自定义 Header 的媒体标签生成代理 URL。
 * 优先依赖已同步的 app_token Cookie；不再附加长期 access token query。
 */
export function proxyMediaUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('/')) {
    return rawUrl;
  }
  syncAppTokenCookie();
  const base = resolveApiUrl(`/api/system/proxy-image?url=${encodeURIComponent(rawUrl)}`);
  return typeof base === 'string' ? base : `/api/system/proxy-image?url=${encodeURIComponent(rawUrl)}`;
}

export function apiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  if (!headers.has('x-app-token')) {
    headers.set('x-app-token', getClientAccessToken());
  }
  const storage = getGatewayClientHeaders();
  Object.entries(storage).forEach(([k, v]) => {
    if (!headers.has(k)) headers.set(k, v);
  });
  return headers;
}

/** 统一带鉴权的 fetch（桌面优先走 Tauri invoke，否则 HTTP） */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  syncAppTokenCookie();

  if (isTauriDesktop()) {
    const tauriRes = await invokeTauriApi(input, init);
    if (tauriRes) return tauriRes;
  }

  const headers = apiHeaders(init?.headers);
  if (init?.body instanceof FormData && headers.has('Content-Type')) {
    headers.delete('Content-Type');
  }
  return fetch(resolveApiUrl(input), { ...init, headers });
}
