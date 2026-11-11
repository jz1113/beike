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
  readDevApiDefaults,
  resolveAccessToken,
  resolveAppDataDir,
  resolveCli,
  resolveDatabaseFile,
  startGateway,
  startViteServer,
  viteOk,
  waitFor,
  webProcessOptions,
  writeApiPort,
} from './web-shared.mjs';
import { ownsWebProcess, stopWebProcess } from './web-processes.mjs';
import { join, resolve } from 'node:path';

const started = Date.now();
const workspaceRoot = getWorkspaceRoot();
const isolated = process.env.BEIKE_ISOLATED_DEV === '1';
let apiPort = readApiPort(workspaceRoot, { isolated });
const vitePort = isolated ? VITE_PORT + 1 : VITE_PORT;
const appDataDir = resolve(process.env.AZHUO_DATA_DIR || (isolated ? join(resolveAppDataDir(), 'development') : resolveAppDataDir()));
let gatewayChild = null;
let viteChild = null;

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild(viteChild);
  if (!gatewayChild || gatewayChild.exitCode !== null) {
    process.exit(code);
  }
  gatewayChild.once('exit', () => process.exit(code));
  killChild(gatewayChild);
  setTimeout(() => process.exit(code), 16000).unref();
};
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

try {
  if (isolated && appDataDir === resolve(resolveAppDataDir())) {
    throw new Error('隔离开发模式不能使用日常用户数据目录，请指定独立的 AZHUO_DATA_DIR');
  }
  const envDefaults = readDevApiDefaults(workspaceRoot, isolated);
  resolveCli(workspaceRoot, 'vite', 'vite');
  const databaseFile = resolveDatabaseFile({ workspaceRoot, appDataDir, isolated });
  ensureAppDatabase(workspaceRoot, appDataDir, databaseFile);
  console.log(`→ SQLite${isolated ? '（隔离开发）' : ''}：${databaseFile}`);
  const accessToken = resolveAccessToken(workspaceRoot, appDataDir, { isolated });
  const processOptions = () => webProcessOptions({ apiPort, appDataDir, accessToken });
  if (ownsWebProcess(workspaceRoot, 'gateway', {}, isolated)) {
    await stopWebProcess(workspaceRoot, 'gateway', isolated);
  }
  if (!(await portFree(apiPort))) {
    if (!isolated) throw new Error(`API 端口 ${apiPort} 已被未记录的进程占用，请先关闭对应启动终端；不会自动停止其它服务`);
    for (apiPort = 3001; apiPort <= 3099 && !(await portFree(apiPort)); apiPort += 1) { /* find isolated port */ }
    if (apiPort > 3099) throw new Error('找不到隔离开发 API 的空闲端口');
  }
  const viteOptions = { ...processOptions(), vitePort, viteConfig: 'tools/configs/vite.config.ts' };
  if (ownsWebProcess(workspaceRoot, 'vite', {}, isolated)
      && !ownsWebProcess(workspaceRoot, 'vite', viteOptions, isolated)) {
    await stopWebProcess(workspaceRoot, 'vite', isolated);
  }
  const reuseVite = ownsWebProcess(workspaceRoot, 'vite', viteOptions, isolated);
  if (!reuseVite && !(await portFree(vitePort))) {
    throw new Error(`UI 端口 ${vitePort} 已被未记录的进程占用，请先关闭对应启动终端`);
  }
  writeApiPort(workspaceRoot, apiPort, { isolated });
  gatewayChild = startGateway({ workspaceRoot, apiPort, appDataDir, accessToken, envDefaults, isolated });
  if (!(await waitFor(() => healthOk(apiPort), `Go API http://127.0.0.1:${apiPort}`, 60000, gatewayChild))) shutdown(1);
  if (!reuseVite) viteChild = startViteServer({ workspaceRoot, apiPort, appDataDir, accessToken, vitePort, isolated });
  if (!(await waitFor(() => viteOk(vitePort), `Vite http://127.0.0.1:${vitePort}`, 60000, viteChild))) shutdown(1);

  const url = `http://127.0.0.1:${vitePort}`;
  console.log(`\n✓ 贝壳云图 Web 已就绪：${url}（共 ${((Date.now() - started) / 1000).toFixed(1)} 秒）\n  ${isolated ? '隔离开发数据' : '用户数据'}：${appDataDir}\n  按 Ctrl+C 停止本次启动的服务。`);
  if (process.env.BEIKE_NO_OPEN !== '1') openBrowser(url);
} catch (error) {
  console.error(`✗ ${error.message}`);
  shutdown(1);
}
