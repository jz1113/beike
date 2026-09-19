import type { Hono } from 'hono';

export function applyDevLogging(app: Hono): void {
  const isDevLogging =
    process.env.DESKTOP_SHELL === '1' || process.env.NODE_ENV === 'development';
  if (!isDevLogging) return;

  const lastLoggedMap = new Map<string, number>();
  const CLEAN_INTERVAL_MS = 30_000;
  let lastCleanup = Date.now();

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    const path = c.req.path;
    const method = c.req.method;

    if (path === '/api/system/dev-log') return;
    if (path === '/api/health' && status === 200) return;

    if (status >= 400) {
      console.error(`[HTTP:ERR] ${method} ${path} → ${status} (${duration}ms)`);
      return;
    }
    if (duration >= 1500) {
      console.warn(`[HTTP:SLOW] ${method} ${path} → ${status} (${duration}ms)`);
      return;
    }
    if (method === 'GET') {
      const now = Date.now();
      const last = lastLoggedMap.get(path) || 0;
      if (now - last < 5000) return;
      lastLoggedMap.set(path, now);
      if (now - lastCleanup > CLEAN_INTERVAL_MS) {
        lastCleanup = now;
        for (const [k, v] of lastLoggedMap) {
          if (now - v > CLEAN_INTERVAL_MS) lastLoggedMap.delete(k);
        }
      }
    }
    console.log(`[HTTP] ${method} ${path} → ${status} (${duration}ms)`);
  });
}
