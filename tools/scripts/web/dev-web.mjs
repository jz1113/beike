#!/usr/bin/env node
/**
 * 本机 Web 开发模式：Go 监听浏览器使用的 API 端口。
 */
import {
  VITE_PORT,
  ensureAppDatabase,
  getWorkspaceRoot,
  healthOk,
  killChild,
  openBrowser,
  portFree,
  readApiPort,
  resolveAccessToken,
  resolveAppDataDir,
  resolveCli,
  startGateway,
  startViteServer,
  stopApiServer,
  viteOk,
  waitFor,
  webProcessOptions,
  writeApiPort,
} from './web-shared.mjs';
import { ownsWebProcess, stopWebProcess } from './web-processes.mjs';
import { join, resolve } from 'node:path';

const workspaceRoot = getWorkspaceRoot();
const isolated = process.env.BEIKE_ISOLATED_DEV === '1';
let apiPort = readApiPort(workspaceRoot, { isolated });
const vitePort = isolated ? VITE_PORT + 1 : VITE_PORT;
const appDataDir = resolve(process.env.AZHUO_DATA_DIR || (isolated ? join(resolveAppDataDir(), 'development') : resolveAppDataDir()));
let apiChild = null;
let gatewayChild = null;
let viteChild = null;

const shutdown = (code = 0) => {
  killChild(viteChild);
  killChild(gatewayChild);
  killChild(apiChild);
  process.exit(code);
};
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

try {
  if (isolated && appDataDir === resolve(resolveAppDataDir())) {
    throw new Error('隔离开发模式不能使用日常用户数据目录，请指定独立的 AZHUO_DATA_DIR');
  }
  resolveCli(workspaceRoot, 'tsx', 'tsx');
  resolveCli(workspaceRoot, 'vite', 'vite');
  ensureAppDatabase(workspaceRoot, appDataDir);
  const accessToken = resolveAccessToken(workspaceRoot, appDataDir, { isolated });
  const processOptions = () => webProcessOptions({ apiPort, appDataDir, accessToken });
  if (ownsWebProcess(workspaceRoot, 'api', {}, isolated)) {
    await stopApiServer(workspaceRoot, { isolated });
  }
  if (!(await portFree(apiPort))) {
    if (!isolated) throw new Error(`API 端口 ${apiPort} 已被未记录的进程占用，请先关闭对应启动终端；不会自动停止其它服务`);
    for (apiPort = 3001; apiPort <= 3099 && !(await portFree(apiPort)); apiPort += 1) { /* find isolated port */ }
    if (apiPort > 3099) throw new Error('找不到隔离开发 API 的空闲端口');
  }
  const viteOptions = { ...processOptions(), vitePort };
  if (ownsWebProcess(workspaceRoot, 'vite', {}, isolated)
      && !ownsWebProcess(workspaceRoot, 'vite', viteOptions, isolated)) {
    await stopWebProcess(workspaceRoot, 'vite', isolated);
  }
  const reuseVite = ownsWebProcess(workspaceRoot, 'vite', viteOptions, isolated);
  if (!reuseVite && !(await portFree(vitePort))) {
    throw new Error(`UI 端口 ${vitePort} 已被未记录的进程占用，请先关闭对应启动终端`);
  }
  writeApiPort(workspaceRoot, apiPort, { isolated });
  const reuseGateway = ownsWebProcess(workspaceRoot, 'gateway', processOptions(), isolated);
  if (!reuseGateway) gatewayChild = startGateway({ workspaceRoot, apiPort, appDataDir, accessToken, isolated });
  if (!(await waitFor(() => healthOk(apiPort), `Go API http://127.0.0.1:${apiPort}`, 60000, gatewayChild))) shutdown(1);
  if (!reuseVite) viteChild = startViteServer({ workspaceRoot, apiPort, appDataDir, accessToken, vitePort, isolated });
  if (!(await waitFor(() => viteOk(vitePort), `Vite http://127.0.0.1:${vitePort}`, 60000, viteChild))) shutdown(1);

  const url = `http://127.0.0.1:${vitePort}`;
  console.log(`\n✓ 贝壳云图 Web 已就绪：${url}\n  ${isolated ? '隔离开发数据' : '用户数据'}：${appDataDir}\n  按 Ctrl+C 停止本次启动的服务。`);
  if (process.env.BEIKE_NO_OPEN !== '1') openBrowser(url);
} catch (error) {
  console.error(`✗ ${error.message}`);
  shutdown(1);
}
