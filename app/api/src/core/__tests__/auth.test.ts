import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { apiAuthMiddleware } from '../auth';

afterEach(() => vi.unstubAllEnvs());
describe('API authentication', () => {
  const request = (headers: Record<string, string> = {}, url = '/api/catalog/assets/library') => {
    const app = new Hono();
    app.use('/api/*', apiAuthMiddleware);
    app.get('*', c => c.json({ ok: true }));
    return app.request(url, { headers });
  };
  it.each(['0', '1'])('rejects dev token and forged host in production desktop=%s', async desktop => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DESKTOP_SHELL', desktop);
    vi.stubEnv('LOCAL_ACCESS_TOKEN', 'private-test-token');
    expect((await request({ 'x-app-token': 'azhuo-local-dev', host: 'localhost.evil' })).status).toBe(401);
    expect((await request({ host: 'localhost' })).status).toBe(401);
    expect((await request({ 'x-app-token': 'private-test-token' })).status).toBe(200);
    expect((await request({}, '/api/system/proxy-image')).status).toBe(401);
  });
  it('handles malformed cookies and missing configuration without crashing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOCAL_ACCESS_TOKEN', 'private-test-token');
    expect((await request({ cookie: 'app_token=%ZZ' })).status).toBe(401);
    vi.stubEnv('LOCAL_ACCESS_TOKEN', '');
    expect((await request()).status).toBe(503);
    expect((await request({}, '/api/health')).status).toBe(200);
  });
});
