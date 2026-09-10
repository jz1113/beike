import { cleanupAssistantMedia } from './routes/assistant/media';
// 优先加载本地环境变量配置
import path from 'node:path';
import { applyEnvFileToProcess } from '@beike/shared/desktopEnvFile';

if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile();
  } catch {
    /* ignore missing .env */
  }
  // 桌面数据目录的 .env 使用覆盖语义：确保用户最新配置生效
  const dataDirEnv = process.env.AZHUO_DATA_DIR ? path.join(process.env.AZHUO_DATA_DIR, '.env') : null;
  if (dataDirEnv) {
    applyEnvFileToProcess(dataDirEnv);
  }
}

// ⚠️ 安全约定：生产环境必须显式设置 LOCAL_ACCESS_TOKEN，禁止静默 fallback。
// 仅在非 production 且未设置时使用 dev 默认值。
if (!process.env.LOCAL_ACCESS_TOKEN && process.env.NODE_ENV !== 'production') {
  process.env.LOCAL_ACCESS_TOKEN = 'azhuo-local-dev';
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { apiAuthMiddleware } from './core/auth';
import * as health from './routes/health';
import catalogRoutes from './routes/mounts/catalog';
import generateRoutes from './routes/mounts/generate';
import assetsRoutes from './routes/mounts/assets';
import assistantRoutes from './routes/mounts/assistant';
import systemRoutes from './routes/mounts/system';
import * as localMedia from './routes/system/local-media';

const isDevLogging =
  process.env.DESKTOP_SHELL === '1' || process.env.NODE_ENV === 'development';

const app = new Hono();

app.use('*', cors({
  origin: (origin) => {
    // 安全：解析失败时返回 undefined（拒绝跨域），而非 null（Hono 对 null 允许所有来源）
    if (!origin) return undefined;
    try {
      const u = new URL(origin);
      const host = u.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return origin;
      if (
        origin.startsWith('tauri://') ||
        origin.startsWith('https://tauri.') ||
        origin.startsWith('http://tauri.')
      ) {
        return origin;
      }
      return undefined;
    } catch {
      return undefined;
    }
  },
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'x-app-token',
    'x-custom-base-url',
    'x-custom-api-key',
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
}));

if (isDevLogging) {
  // 记录最近打印过的 GET 路径与时间戳，避免高频轮询连续刷屏
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

    // 内部上报通道与正常健康检查直接静音
    if (path === '/api/system/dev-log') return;
    if (path === '/api/health' && status === 200) return;

    // 异常请求（4xx、5xx）高亮打印，便于排查定位
    if (status >= 400) {
      console.error(`[HTTP:ERR] ${method} ${path} → ${status} (${duration}ms)`);
      return;
    }

    // 慢请求（>1500ms）提示性能瓶颈
    if (duration >= 1500) {
      console.warn(`[HTTP:SLOW] ${method} ${path} → ${status} (${duration}ms)`);
      return;
    }

    // 高频只读 GET 轮询（如 /api/assets/tasks、心跳状态）：5 秒内同路径仅打印一次
    if (method === 'GET') {
      const now = Date.now();
      const last = lastLoggedMap.get(path) || 0;
      if (now - last < 5000) {
        return;
      }
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

app.use('/api/*', apiAuthMiddleware);

app.get('/api/health', async (c) => health.GET(c.req.raw));

import { checkpointDatabase, prisma, initializeDatabase } from '@beike/shared/prisma';

app.route('/api/catalog', catalogRoutes);
app.route('/api/generate', generateRoutes);
app.route('/api/assets', assetsRoutes);
app.route('/api/assistant', assistantRoutes);
app.route('/api/system', systemRoutes);

app.get('/storage/*', (c) => localMedia.GET(c.req.raw));

async function startServer() {
  await initializeDatabase();
const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '127.0.0.1';

console.log(`→ 贝壳云图 API 服务 http://${hostname}:${port}`);

// 服务启动时主动检查点并截断 WAL，回收上次运行遗留的磁盘与内存页缓存
await checkpointDatabase().catch(() => {});

// 启动时自愈清理上次异常退出/崩溃遗留的真正无 taskId 孤儿任务，防止前端启动恢复时产生并发风暴
// 注意：已分配 taskId 的异步任务（如视频生成）由云端持续渲染，绝不在本地重启时粗暴终止，允许轮询机制自愈恢复
prisma.imageTask
  .updateMany({
    where: { 
      status: 'IN_PROGRESS',
      taskId: null,
    },
    data: {
      status: 'FAILURE',
      failReason: '服务重启，未提交至云端的孤儿任务已自动终止',
    },
  })
  .then((res) => {
    if (res.count > 0) {
      console.log(`→ [任务自愈] 已自动重置 ${res.count} 个未提交云端的孤儿任务为 FAILURE`);
    }
  })
  .catch(() => {});

// 每 10 分钟定期执行轻量 WAL 截断与回收
void cleanupAssistantMedia();
const walInterval = setInterval(() => {
  void cleanupAssistantMedia();
  checkpointDatabase().catch(() => {});
}, 10 * 60 * 1000);
walInterval.unref();

const server = serve({ fetch: app.fetch, port, hostname });

const handleShutdown = async (signal: string) => {
  console.log(`[API] 收到 ${signal}，开始优雅关闭...`);
  try {
    clearInterval(walInterval);
    await checkpointDatabase().catch((err) => {
      console.error('[API] shutdown checkpointDatabase 失败:', err);
    });
    server.close();
    console.log('[API] HTTP 服务已关闭');
  } catch (err) {
    console.error('[API] shutdown 异常:', err);
  } finally {
    process.exit(0);
  }
};
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

}
void startServer().catch(error => {
  console.error('[API] 数据库初始化失败，服务未启动:', error);
  process.exitCode = 1;
});
