#!/usr/bin/env node
/**
 * 本机 Web 开发模式：同时启动 Hono API 与 Vite UI，浏览器访问 http://127.0.0.1:5173。
 */
import {
  VITE_PORT,
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
  startViteServer,
  stopApiServer,
  viteOk,
  waitFor,
  writeApiPort,
} from './web-shared.mjs';

const workspaceRoot = getWorkspaceRoot();
const apiPort = readApiPort(workspaceRoot);
const appDataDir = process.env.AZHUO_DATA_DIR || resolveAppDataDir();

try {
  resolveCli(workspaceRoot, 'tsx', 'tsx');
  resolveCli(workspaceRoot, 'vite', 'vite');
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

ensureAppDatabase(workspaceRoot, appDataDir);
writeApiPort(workspaceRoot, apiPort);
const accessToken = resolveAccessToken(workspaceRoot, appDataDir);

if (await healthOk(apiPort)) {
  console.log(`→ 重启 API 以加载最新代码（127.0.0.1:${apiPort}）…`);
  await stopApiServer();
} else {
  console.log(`→ 启动 API 服务（127.0.0.1:${apiPort}）…`);
}

const apiChild = startApiServer({ workspaceRoot, apiPort, appDataDir, accessToken });
let viteChild = null;

const shutdown = () => {
  killChild(viteChild);
  killChild(apiChild);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!(await waitFor(() => healthOk(apiPort), `API http://127.0.0.1:${apiPort}`, 60000, apiChild))) {
  shutdown();
}

if (await viteOk()) {
  console.log(`✓ 复用已有 Vite：http://127.0.0.1:${VITE_PORT}`);
} else {
  console.log(`→ 启动 Vite UI（127.0.0.1:${VITE_PORT}）…`);
  viteChild = startViteServer({ workspaceRoot, accessToken });
  if (!(await waitFor(viteOk, `Vite http://127.0.0.1:${VITE_PORT}`, 60000, viteChild))) {
    shutdown();
  }
}

const url = `http://127.0.0.1:${VITE_PORT}`;
console.log(`\n✓ 贝壳云图 Web 已就绪：${url}\n  按 Ctrl+C 停止服务。`);
if (process.env.BEIKE_NO_OPEN !== '1') openBrowser(url);
