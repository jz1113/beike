import type { Context, Next } from 'hono';
import {
  extractRequestToken,
  getAccessToken,
  getAdminToken,
  isAccessTokenConfigured,
  isAuthorized,
} from '@beike/server-kit/apiAuth';
import { verifyMediaSignature } from '@beike/server-kit/mediaSign';

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
    if (rawMediaUrl && secret && (verifyMediaSignature(rawMediaUrl, exp, sig, secret) || verifyMediaSignature('proxy-media-session', exp, sig, secret))) {
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
      { success: false, error: '服务端未配置访问令牌，请联系管理员' },
      503,
    );
  }

  const token = extractRequestToken(c.req.raw);
  const admin = getAdminToken();
  const isDev = process.env.NODE_ENV !== 'production';

  const ok = isAuthorized(c.req.raw);

  if (path.startsWith('/api/system/proxy-image')) {
    if (isProxyMediaAuthorized(c) || ok) {
      return next();
    }
    return c.json(
      { success: false, error: '未授权：缺少有效的访问凭证或媒体签名' },
      401,
    );
  }

  if (!ok) {
    return c.json({ success: false, error: '未授权：访问令牌缺失或无效' }, 401);
  }

  const isDanger =
    path.startsWith('/api/assets/storage/migrate') ||
    path.startsWith('/api/assets/storage/test');

  if (isDanger && !isDev && process.env.DESKTOP_SHELL !== '1') {
    if (!admin) {
      return c.json(
        { success: false, error: '管理员令牌未配置，无法执行此操作' },
        403,
      );
    }
    if (token !== admin) {
      return c.json({ success: false, error: '需要管理员权限' }, 403);
    }
  }

  return next();
}
