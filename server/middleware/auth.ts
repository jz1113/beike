import type { Context, Next } from 'hono';
import {
  extractRequestToken,
  getAccessToken,
  getAdminToken,
  isAccessTokenConfigured,
} from '../../src/lib/apiAuth';
import { verifyMediaSignature } from '../../src/lib/mediaSign';

function isProxyMediaAuthorized(c: Context): boolean {
  const token = extractRequestToken(c.req.raw);
  const access = getAccessToken();
  const admin = getAdminToken();
  if (token && access && (token === access || (admin && token === admin))) {
    return true;
  }

  try {
    const url = new URL(c.req.url);
    const rawMediaUrl = url.searchParams.get('url')?.trim();
    const exp = Number.parseInt(url.searchParams.get('exp') || '', 10);
    const sig = url.searchParams.get('sig')?.trim() || '';
    const secret = access || '';
    if (rawMediaUrl && secret && verifyMediaSignature(rawMediaUrl, exp, sig, secret)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function apiAuthMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  if (path === '/api/health') {
    return next();
  }

  if (
    path === '/api/system/dev-log' &&
    process.env.DESKTOP_SHELL === '1' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return next();
  }

  if (!isAccessTokenConfigured()) {
    return c.json(
      { success: false, error: 'Server misconfigured: set LOCAL_ACCESS_TOKEN in production' },
      503,
    );
  }

  const token = extractRequestToken(c.req.raw);
  const access = getAccessToken();
  const admin = getAdminToken();
  const ok = Boolean(token && access && (token === access || (admin && token === admin)));

  if (!ok && path.startsWith('/api/system/proxy-image')) {
    if (isProxyMediaAuthorized(c)) {
      return next();
    }
    return c.json(
      { success: false, error: 'Unauthorized: missing app_token cookie or valid media signature' },
      401,
    );
  }

  if (!ok) {
    return c.json({ success: false, error: 'Unauthorized: missing or invalid x-app-token' }, 401);
  }

  const isDanger =
    (path === '/api/assets/tasks' && c.req.method === 'DELETE') ||
    path.startsWith('/api/assets/storage/migrate') ||
    path.startsWith('/api/assets/storage/test');

  if (isDanger) {
    if (!admin) {
      return c.json(
        { success: false, error: 'Forbidden: ADMIN_ACCESS_TOKEN not configured' },
        403,
      );
    }
    if (token !== admin) {
      return c.json({ success: false, error: 'Forbidden: admin token required' }, 403);
    }
  }

  return next();
}
