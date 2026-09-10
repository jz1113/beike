import { invoke } from '@tauri-apps/api/core';
import { getApiBase, resolveApiUrl } from '@/lib/desktopRuntime';
import { getClientAccessToken } from '@/lib/apiToken';
import { getGatewayClientHeaders } from '@/lib/gatewayClient';

function buildHeaders(extra?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => {
        out[k] = v;
      });
    } else if (Array.isArray(extra)) {
      extra.forEach(([k, v]) => {
        if (k && v !== undefined) out[k] = String(v);
      });
    } else if (typeof extra === 'object') {
      Object.entries(extra).forEach(([k, v]) => {
        if (k && v !== undefined) out[k] = String(v);
      });
    }
  }
  if (!out['x-app-token'] && !out['X-App-Token']) {
    out['x-app-token'] = getClientAccessToken();
  }
  const gateway = getGatewayClientHeaders();
  Object.entries(gateway).forEach(([k, v]) => {
    if (v && !out[k]) out[k] = String(v);
  });
  return out;
}

function pathOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    const resolved = resolveApiUrl(input);
    const url = typeof resolved === 'string' ? resolved : String(resolved);
    try {
      return new URL(url, getApiBase() || 'http://127.0.0.1').pathname;
    } catch {
      return url.split('?')[0];
    }
  }
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

function shouldUseRust(path: string): boolean {
  // 二进制流、图片代理、ZIP 导出等媒体传输一律走 HTTP Sidecar 直接传输，防止 Rust text 编码截断与损坏
  // 图集反推耗时可达数分钟，绕过 Rust 480s 超时限制
  if (
    path.includes('/proxy-image') ||
    path.includes('/export-zip') ||
    path.includes('/proxy-video') ||
    path.includes('/export') ||
    path.includes('/catalog/assets/deconstruct') ||
    path.includes('/generate/depth-video') ||
    path.includes('/generate/depth-image')
  ) {
    return false;
  }
  return path.startsWith('/api/') || path === '/api';
}

/** 桌面 Tauri 下优先走 Rust 命令；未覆盖的路由回退 HTTP sidecar */
export async function invokeTauriApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    const method = (init?.method || 'GET').toUpperCase();
    const path = pathOf(input);
    if (!shouldUseRust(path)) return null;

    const resolved = resolveApiUrl(input);
    const url =
      typeof resolved === 'string'
        ? resolved
        : resolved instanceof URL
          ? resolved.href
          : (resolved as Request).url;

    const headers = buildHeaders(init?.headers);

    let body: string | null = null;
    if (init?.body) {
      if (typeof init.body === 'string') body = init.body;
      else if (init.body instanceof FormData) return null;
      else body = await new Response(init.body).text();
    }

    const result = await invoke<{ status: number; body: string; headers: Record<string, string> }>(
      'desktop_api',
      {
        req: { method, url, path, headers, body },
        method,
        url,
        path,
        headers,
        body,
      },
    );

    const safeHeaders: Record<string, string> = {};
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        const lk = k.toLowerCase();
        if (
          lk === 'transfer-encoding' ||
          lk === 'content-encoding' ||
          lk === 'content-length' ||
          lk === 'connection' ||
          lk === 'keep-alive' ||
          lk === 'set-cookie'
        ) {
          continue;
        }
        safeHeaders[k] = v;
      }
    }
    if (!safeHeaders['content-type'] && !safeHeaders['Content-Type']) {
      safeHeaders['content-type'] = 'application/json';
    }

    return new Response(result.body, {
      status: result.status,
      headers: safeHeaders,
    });
  } catch (err: any) {
    console.error('[tauriApi] invoke desktop_api failed:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: typeof err === 'string' ? err : err?.message || '桌面端服务通信异常',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
