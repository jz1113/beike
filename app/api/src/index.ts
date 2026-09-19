import { loadApiEnv } from './bootstrap/env';

loadApiEnv();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { apiAuthMiddleware } from './core/auth';
import { errorResponse } from './core/errors';
import * as health from './routes/health';
import catalogRoutes from './routes/mounts/catalog';
import generateRoutes from './routes/mounts/generate';
import assetsRoutes from './routes/mounts/assets';
import assistantRoutes from './routes/mounts/assistant';
import systemRoutes from './routes/mounts/system';
import * as localMedia from './routes/system/local-media';
import { applyCors } from './bootstrap/cors';
import { applyDevLogging } from './bootstrap/logging';
import { installShutdown, recoverOnBoot } from './bootstrap/lifecycle';
import { cleanupAssistantMedia } from './routes/assistant/media';
import { checkpointDatabase, initializeDatabase } from '@beike/server-kit/prisma';

const app = new Hono();

applyCors(app);
applyDevLogging(app);
app.onError((error) => errorResponse(error));
app.use('/api/*', apiAuthMiddleware);
app.get('/api/health', async (c) => health.GET(c.req.raw));
app.route('/api/catalog', catalogRoutes);
app.route('/api/generate', generateRoutes);
app.route('/api/assets', assetsRoutes);
app.route('/api/assistant', assistantRoutes);
app.route('/api/system', systemRoutes);
app.get('/storage/*', (c) => localMedia.GET(c.req.raw));

export { app };

async function startServer() {
  await initializeDatabase();
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const hostname = process.env.HOSTNAME || '127.0.0.1';
  console.log(`→ 贝壳云图 API 服务 http://${hostname}:${port}`);
  await recoverOnBoot();
  void cleanupAssistantMedia();
  const walInterval = setInterval(() => {
    void cleanupAssistantMedia();
    checkpointDatabase().catch(() => {});
  }, 10 * 60 * 1000);
  walInterval.unref();
  const server = serve({ fetch: app.fetch, port, hostname });
  installShutdown(server, walInterval);
}

void startServer().catch(error => {
  console.error('[API] 数据库初始化失败，服务未启动:', error);
  process.exitCode = 1;
});
