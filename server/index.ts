import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { apiAuthMiddleware } from './middleware/auth';
import { toHonoResponse } from './adapters/http';

import * as health from './routes/health';
import * as products from './routes/catalog/products';
import * as collect from './routes/catalog/collect';
import * as styles from './routes/catalog/styles';
import * as styleExtract from './routes/catalog/styles/extract';
import * as styleParseLink from './routes/catalog/styles/parse-link';
import * as prompts from './routes/catalog/prompts';
import * as imageGen from './routes/generate/image';
import * as videoGen from './routes/generate/video';
import * as analyze from './routes/generate/analyze';
import * as exportZip from './routes/generate/export-zip';
import * as tasks from './routes/assets/tasks';
import * as storageTest from './routes/assets/storage/test';
import * as storageMigrate from './routes/assets/storage/migrate';
import * as assistantChat from './routes/assistant/chat';
import * as assistantSessions from './routes/assistant/sessions';
import * as extractDocument from './routes/assistant/extract-document';
import * as proxyImage from './routes/system/proxy-image';
import * as systemConfig from './routes/system/config';
import * as desktopEnv from './routes/system/desktop-env';
import * as localStorageStats from './routes/system/local-storage';
import * as modelsFetch from './routes/system/models/fetch';
import * as devLog from './routes/system/dev-log';

const isDevLogging =
  process.env.DESKTOP_SHELL === '1' || process.env.NODE_ENV === 'development';

const app = new Hono();

const allowedOrigins = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'tauri://localhost',
  'http://tauri.localhost',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (allowedOrigins.includes(origin)) return origin;
    if (origin.startsWith('http://127.0.0.1:')) return origin;
    return null;
  },
}));

if (isDevLogging) {
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    if (c.req.path === '/api/system/dev-log') return;
    console.log(
      `[HTTP] ${c.req.method} ${c.req.path} → ${c.res.status} (${Date.now() - start}ms)`,
    );
  });
}

app.use('/api/*', apiAuthMiddleware);

app.get('/api/health', async (c) => toHonoResponse(await health.GET()));

app.get('/api/catalog/products', async (c) => toHonoResponse(await products.GET(c.req.raw)));
app.post('/api/catalog/products', async (c) => toHonoResponse(await products.POST(c.req.raw)));
app.put('/api/catalog/products', async (c) => toHonoResponse(await products.PUT(c.req.raw)));
app.delete('/api/catalog/products', async (c) => toHonoResponse(await products.DELETE(c.req.raw)));

app.post('/api/catalog/collect', async (c) => toHonoResponse(await collect.POST(c.req.raw)));

app.get('/api/catalog/styles', async (c) => toHonoResponse(await styles.GET(c.req.raw)));
app.post('/api/catalog/styles', async (c) => toHonoResponse(await styles.POST(c.req.raw)));
app.put('/api/catalog/styles', async (c) => toHonoResponse(await styles.PUT(c.req.raw)));
app.delete('/api/catalog/styles', async (c) => toHonoResponse(await styles.DELETE(c.req.raw)));

app.post('/api/catalog/styles/extract', async (c) => toHonoResponse(await styleExtract.POST(c.req.raw)));
app.post('/api/catalog/styles/parse-link', async (c) => toHonoResponse(await styleParseLink.POST(c.req.raw)));

app.get('/api/catalog/prompts', async (c) => toHonoResponse(await prompts.GET()));
app.post('/api/catalog/prompts', async (c) => toHonoResponse(await prompts.POST(c.req.raw)));
app.delete('/api/catalog/prompts', async (c) => toHonoResponse(await prompts.DELETE(c.req.raw)));

app.post('/api/generate/image', async (c) => toHonoResponse(await imageGen.POST(c.req.raw)));
app.get('/api/generate/image', async (c) => toHonoResponse(await imageGen.GET(c.req.raw)));
app.post('/api/generate/video', async (c) => toHonoResponse(await videoGen.POST(c.req.raw)));
app.get('/api/generate/video', async (c) => toHonoResponse(await videoGen.GET(c.req.raw)));
app.post('/api/generate/analyze', async (c) => toHonoResponse(await analyze.POST(c.req.raw)));
app.post('/api/generate/export-zip', async (c) => toHonoResponse(await exportZip.POST(c.req.raw)));

app.get('/api/assets/tasks', async (c) => toHonoResponse(await tasks.GET(c.req.raw)));
app.delete('/api/assets/tasks', async (c) => toHonoResponse(await tasks.DELETE(c.req.raw)));

app.post('/api/assets/storage/test', async (c) => toHonoResponse(await storageTest.POST(c.req.raw)));
app.post('/api/assets/storage/migrate', async (c) => toHonoResponse(await storageMigrate.POST(c.req.raw)));

app.post('/api/assistant/chat', async (c) => toHonoResponse(await assistantChat.POST(c.req.raw)));
app.get('/api/assistant/sessions', async (c) => toHonoResponse(await assistantSessions.GET()));
app.put('/api/assistant/sessions', async (c) => toHonoResponse(await assistantSessions.PUT(c.req.raw)));
app.delete('/api/assistant/sessions', async (c) => toHonoResponse(await assistantSessions.DELETE(c.req.raw)));
app.post('/api/assistant/extract-document', async (c) => toHonoResponse(await extractDocument.POST(c.req.raw)));

app.get('/api/system/proxy-image', async (c) => toHonoResponse(await proxyImage.GET(c.req.raw)));
app.get('/api/system/config', async (c) => toHonoResponse(await systemConfig.GET()));
app.post('/api/system/config', async (c) => toHonoResponse(await systemConfig.POST(c.req.raw)));
app.post('/api/system/desktop-env', async (c) => toHonoResponse(await desktopEnv.POST(c.req.raw)));
app.get('/api/system/local-storage/stats', async (c) => toHonoResponse(await localStorageStats.GET()));
app.post('/api/system/local-storage/clear-derived', async (c) => toHonoResponse(await localStorageStats.POST()));
app.post('/api/system/models/fetch', async (c) => toHonoResponse(await modelsFetch.POST(c.req.raw)));
app.post('/api/system/dev-log', async (c) => toHonoResponse(await devLog.POST(c.req.raw)));

const distRoot = process.env.DESKTOP_STATIC_DIR;
if (distRoot) {
  app.use('/*', serveStatic({ root: distRoot }));
  app.get('*', serveStatic({ path: 'index.html', root: distRoot }));
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '127.0.0.1';

console.log(`→ 贝壳云图 API 服务 http://${hostname}:${port}`);

serve({ fetch: app.fetch, port, hostname });
