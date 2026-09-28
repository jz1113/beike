import fs from 'node:fs';
import path from 'node:path';
import type { Context, Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { getAccessToken } from '@server/infrastructure/auth/apiAuth';

const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** 本机 Web 形态：同源托管构建产物时才启用 */
export function resolveWebDistDir(): string | null {
  const configured = process.env.WEB_DIST_DIR?.trim();
  if (!configured) return null;
  const dir = path.resolve(configured);
  if (!fs.existsSync(path.join(dir, 'index.html'))) return null;
  return dir;
}

/**
 * 同源托管 dist。
 *
 * 首页响应会写入 app_token Cookie：服务仅监听回环地址，浏览器与 API 同源，
 * 前端据此获得访问令牌，替代桌面壳里由 Rust 注入令牌的流程。
 */
export function mountWebShell(app: Hono): boolean {
  const distDir = resolveWebDistDir();
  if (!distDir) return false;

  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

  const sendIndex = (c: Context) => {
    const token = getAccessToken();
    if (token) {
      c.header(
        'Set-Cookie',
        `app_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${TOKEN_COOKIE_MAX_AGE}`,
      );
    }
    c.header('Cache-Control', 'no-store');
    return c.html(indexHtml);
  };

  app.get('/', (c) => sendIndex(c));
  app.get('/index.html', (c) => sendIndex(c));

  const staticOpts = {
    root: distDir,
    rewriteRequestPath: (p: string) => p.replace(/^\//, ''),
  };
  app.use('/assets/*', serveStatic(staticOpts));
  app.use('/*', serveStatic(staticOpts));

  // SPA 回退：非 API / 媒体路径一律交给前端路由
  app.get('/*', (c) => {
    const p = c.req.path;
    if (p.startsWith('/api') || p.startsWith('/storage')) return c.notFound();
    return sendIndex(c);
  });

  return true;
}
