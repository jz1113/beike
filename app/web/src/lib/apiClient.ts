
import { getGatewayClientHeaders } from '@/lib/gatewayClient';
import { getClientAccessToken, syncAppTokenCookie } from '@/lib/apiToken';
import { getApiBase, isTauriDesktop, resolveApiUrl } from '@/lib/desktopRuntime';
import { invokeTauriApi } from '@/lib/tauriApi';

export { getClientAccessToken, setClientAccessToken, syncAppTokenCookie } from '@/lib/apiToken';

let mediaSession: { exp: number; sig: string } | null = null;
export function setMediaSession(value: { exp: number; sig: string } | undefined) {
  if (value) mediaSession = value;
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
  const storage = getGatewayClientHeaders();
  Object.entries(storage).forEach(([k, v]) => {
    if (!headers.has(k)) headers.set(k, v);
  });
  return headers;
}

/** 统一带鉴权的 fetch（桌面优先直连 sidecar HTTP，否则 Tauri invoke / 浏览器 fetch） */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  syncAppTokenCookie();

  if (isTauriDesktop()) {
    const base = getApiBase();
    if (base) {
      const headers = apiHeaders(init?.headers);
      if (init?.body instanceof FormData && headers.has('Content-Type')) {
        headers.delete('Content-Type');
      }
      try {
        return await fetch(resolveApiUrl(input), { ...init, headers });
      } catch (directErr) {
        console.warn('[apiFetch] 直连 API 遇到网络异常，自动降级切换至 Tauri IPC 备用通道:', directErr);
        const tauriRes = await invokeTauriApi(input, init);
        if (tauriRes) return tauriRes;
        throw directErr;
      }
    }
    const tauriRes = await invokeTauriApi(input, init);
    if (tauriRes) return tauriRes;
  }

  const headers = apiHeaders(init?.headers);
  if (init?.body instanceof FormData && headers.has('Content-Type')) {
    headers.delete('Content-Type');
  }
  return fetch(resolveApiUrl(input), { ...init, headers });
}
