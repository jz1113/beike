import { cors } from 'hono/cors';

export function extraOriginsFromEnv(raw = process.env.PUBLIC_WEB_ORIGIN || process.env.PUBLIC_WEB_ORIGINS || ''): string[] {
  return raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    if (origin.startsWith('tauri://')) return true;
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'tauri.localhost';
  } catch {
    return origin.startsWith('tauri://');
  }
}

/** Exact Origin match only: scheme + host + port. No hostname-only fallback. */
export function isAllowedOrigin(
  origin: string,
  extraOrigins: string[] = extraOriginsFromEnv(),
  options: { allowLoopback?: boolean } = {},
): boolean {
  if (!origin) return false;
  if (options.allowLoopback !== false && isLoopbackOrigin(origin)) return true;
  return extraOrigins.includes(origin);
}

export function allowLoopbackOrigins(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DESKTOP_SHELL === '1';
}

export const apiCors = cors({
  origin: (origin) => {
    if (!origin) return undefined;
    return isAllowedOrigin(origin, extraOriginsFromEnv(), { allowLoopback: allowLoopbackOrigins() }) ? origin : undefined;
  },
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'x-app-token',
    'x-workspace-token',
    'x-custom-base-url',
    'x-custom-api-key',
    'x-lianchi-api-key',
    'x-image-protocol',
    'x-wanbang-key',
    'x-wanbang-secret',
    'x-storage-endpoint',
    'x-storage-bucket',
    'x-storage-key',
    'x-storage-secret',
    'x-storage-provider',
    'x-idempotency-key',
    'x-client-task-id',
    'x-request-id',
    'x-session-id',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
});
