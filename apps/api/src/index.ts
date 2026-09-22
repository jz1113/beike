import { loadApiEnv } from './bootstrap/env';

loadApiEnv();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { apiAuthMiddleware } from './core/auth';
import { asJsonRoute } from './core/handler';
import { errorResponse } from './core/errors';
import * as health from './routes/health';
import catalogRoutes from './routes/mounts/catalog';
import generateRoutes from './routes/mounts/generate';
import assetsRoutes from './routes/mounts/assets';
import assistantRoutes from './routes/mounts/assistant';
import systemRoutes from './routes/mounts/system';
import workshopRoutes from './routes/mounts/workshop';
import * as localMedia from './routes/system/local-media';
import { applyCors } from './bootstrap/cors';
import { applyRequestLogging } from './bootstrap/logging';
import { requestIdMiddleware } from './core/requestId';
import { installShutdown, recoverOnBoot, runPeriodicMaintenance } from './bootstrap/lifecycle';
import { cleanupAssistantMedia } from './routes/assistant/media';
import { initializeDatabase, unscopedPrisma } from '@beike/server-kit/prisma';
import { adoptLegacyWorkspaceRows } from '@beike/server-kit/database/workspaceIsolation';
import { seedOfficialCatalog } from '@beike/server-kit/officialCatalogSeed';
import { mountWebShell } from './core/webShell';
import { isAuthorized, isAccessTokenConfigured } from '@beike/server-kit/apiAuth';
import { isFixedLocalWorkspace, resolveWorkspaceFromRequest, runWithWorkspace } from '@beike/server-kit/workspaceContext';

const app = new Hono();

applyCors(app);
app.use('*', requestIdMiddleware);
applyRequestLogging(app);
app.onError((error) => errorResponse(error));
app.use('/api/*', apiAuthMiddleware);
app.get('/api/health', async (c) => asJsonRoute((req) => health.GET(req))(c.req.raw));
app.route('/api/catalog', catalogRoutes);
app.route('/api/generate', generateRoutes);
app.route('/api/assets', assetsRoutes);
app.route('/api/assistant', assistantRoutes);
app.route('/api/system', systemRoutes);
app.route('/api/workshop', workshopRoutes);
app.get('/storage/*', async (c) => {
  if (!isAccessTokenConfigured()) {
    return c.json({ success: false, error: '服务端未配置访问令牌，请联系管理员' }, 503);
  }
  if (!isAuthorized(c.req.raw) && !isFixedLocalWorkspace()) {
    return c.json({ success: false, error: '未授权：访问令牌缺失或无效' }, 401);
  }
  const workspace = resolveWorkspaceFromRequest(c.req.raw);
  if (!workspace.ok) {
    return c.json({ success: false, error: workspace.error }, workspace.status);
  }
  return runWithWorkspace(workspace.store.workspaceId, () => localMedia.GET(c.req.raw), workspace.store.secret);
});
const webShellMounted = mountWebShell(app);

export { app };

async function startServer() {
  await initializeDatabase();
  await seedOfficialCatalog();
  await adoptLegacyWorkspaceRows(unscopedPrisma);
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const hostname = process.env.HOSTNAME || '127.0.0.1';
  console.log(`→ 贝壳云图 API 服务 http://${hostname}:${port}`);
  if (webShellMounted) console.log(`→ Web 静态托管已启用 WEB_DIST_DIR=${process.env.WEB_DIST_DIR}`);
  await recoverOnBoot();
  void cleanupAssistantMedia();
  const walInterval = setInterval(() => {
    void cleanupAssistantMedia();
    void runPeriodicMaintenance();
  }, 10 * 60 * 1000);
  walInterval.unref();
  const server = serve({ fetch: app.fetch, port, hostname });
  installShutdown(server, walInterval);
}

void startServer().catch(error => {
  console.error('[API] 数据库初始化失败，服务未启动:', error);
  process.exitCode = 1;
});
