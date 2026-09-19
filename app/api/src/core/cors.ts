import { cors } from 'hono/cors';

function isAllowedOrigin(origin: string): boolean {
  try {
    if (origin.startsWith('tauri://')) return true;
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    if (host === 'tauri.localhost') return true;
    return false;
  } catch {
    return false;
  }
}

export const apiCors = cors({
  origin: (origin) => {
    if (!origin) return undefined;
    return isAllowedOrigin(origin) ? origin : undefined;
  },
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'x-app-token',
    'x-custom-base-url',
    'x-custom-api-key',
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
