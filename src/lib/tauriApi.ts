import { invoke } from '@tauri-apps/api/core';
import { getApiBase, resolveApiUrl } from '@/lib/desktopRuntime';
import { getClientAccessToken } from '@/lib/apiToken';
import { getGatewayClientHeaders } from '@/lib/gatewayClient';

function buildHeaders(extra?: HeadersInit): Record<string, string> {
  const headers = new Headers(extra || {});
  if (!headers.has('x-app-token')) {
    headers.set('x-app-token', getClientAccessToken());
  }
  const gateway = getGatewayClientHeaders();
  Object.entries(gateway).forEach(([k, v]) => {
    if (!headers.has(k)) headers.set(k, v);
  });
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

const RUST_HANDLED_PREFIXES = [
  '/api/health',
  '/api/catalog/products',
  '/api/catalog/prompts',
  '/api/catalog/styles',
  '/api/assets/tasks',
];

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

function shouldUseRust(path: string, method: string): boolean {
  if (path === '/api/health') return true;
  if (path.startsWith('/api/catalog/products')) return true;
  if (path.startsWith('/api/catalog/prompts')) return true;
  if (
    path.startsWith('/api/catalog/styles') &&
    !path.includes('/extract') &&
    !path.includes('/parse-link')
  ) {
    return true;
  }
  if (path.startsWith('/api/assets/tasks')) return true;
  return RUST_HANDLED_PREFIXES.some((p) => path.startsWith(p));
}

/** 桌面 Tauri 下优先走 Rust 命令；未覆盖的路由回退 HTTP sidecar */
export async function invokeTauriApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    const method = (init?.method || 'GET').toUpperCase();
    const path = pathOf(input);
    if (!shouldUseRust(path, method)) return null;

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
      { method, url, path, headers, body },
    );

    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch {
    return null;
  }
}
