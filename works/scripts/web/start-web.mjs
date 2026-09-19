#!/usr/bin/env node
/**
 * 本机 Web 生产模式：由 Hono API 同源托管 app/web/dist，浏览器访问 http://127.0.0.1:<port>。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureAppDatabase,
  getWorkspaceRoot,
  healthOk,
  killChild,
  openBrowser,
  readApiPort,
  resolveAccessToken,
  resolveAppDataDir,
  resolveCli,
  startApiServer,
  stopApiServer,
  waitFor,
  writeApiPort,
} from './web-shared.mjs';

const workspaceRoot = getWorkspaceRoot();
const distDir = join(workspaceRoot, 'app', 'web', 'dist');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('✗ 未找到前端构建产物，请先执行 pnpm run build:ui');
  process.exit(1);
}

try {
  resolveCli(workspaceRoot, 'tsx', 'tsx');
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

const apiPort = readApiPort(workspaceRoot);
const appDataDir = resolveAppDataDir();
ensureAppDatabase(workspaceRoot, appDataDir);
writeApiPort(workspaceRoot, apiPort);
const accessToken = resolveAccessToken(workspaceRoot, appDataDir);

if (await healthOk(apiPort)) {
  console.log(`→ 重启已在运行的 API（127.0.0.1:${apiPort}）…`);
  await stopApiServer();
}

const apiChild = startApiServer({
  workspaceRoot,
  apiPort,
  appDataDir,
  accessToken,
  watch: false,
  extraEnv: { WEB_DIST_DIR: distDir },
});

const shutdown = () => {
  killChild(apiChild);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
apiChild.on('exit', (code) => process.exit(code ?? 0));

const url = `http://127.0.0.1:${apiPort}`;
if (!(await waitFor(() => healthOk(apiPort), `API ${url}`, 60000, apiChild))) {
  shutdown();
}

console.log(`\n✓ 贝壳云图 Web 已就绪：${url}\n  按 Ctrl+C 停止服务。`);
if (process.env.BEIKE_NO_OPEN !== '1') openBrowser(url);
