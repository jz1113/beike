#!/usr/bin/env node
/**
 * 生产 Web：Go 托管已构建的 tools/build/ui，并提供 /api 与 /storage。
 * Nginx 应反代到 127.0.0.1:PORT，不要把 PORT 直接暴露公网。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureAppDatabase,
  gatewayBinary,
  healthOk,
  killChild,
  resolveAccessToken,
  resolveAppDataDir,
  startGateway,
  waitFor,
} from './web-shared.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const webDistDir = process.env.WEB_DIST_DIR || join(workspaceRoot, 'tools/build/ui');
const appDataDir = process.env.AZHUO_DATA_DIR || resolveAppDataDir();
const apiPort = Number.parseInt(process.env.PORT || '3000', 10);

if (!existsSync(join(webDistDir, 'index.html'))) {
  console.error(`找不到前端构建产物：${webDistDir}/index.html`);
  console.error('请先在仓库根目录执行：pnpm build');
  process.exit(1);
}

if (!existsSync(gatewayBinary(workspaceRoot))) {
  console.error(`找不到 API 构建产物：${gatewayBinary(workspaceRoot)}`);
  console.error('请先在仓库根目录执行：pnpm build:api');
  process.exit(1);
}

ensureAppDatabase(workspaceRoot, appDataDir);
const accessToken = process.env.LOCAL_ACCESS_TOKEN || resolveAccessToken(workspaceRoot, appDataDir);

const sharedEnv = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PUBLIC_WEB_ORIGIN: process.env.PUBLIC_WEB_ORIGIN || '',
};
const gateway = startGateway({
  workspaceRoot,
  apiPort,
  appDataDir,
  accessToken,
  extraEnv: { ...sharedEnv, WEB_DIST_DIR: webDistDir, HOSTNAME: process.env.HOSTNAME || '127.0.0.1' },
  record: false,
  build: false,
});

const stop = (signal) => {
  killChild(gateway);
  if (signal) process.exit(0);
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
gateway.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
if (!(await waitFor(() => healthOk(apiPort), `Go API http://127.0.0.1:${apiPort}`, 60000, gateway))) {
  killChild(gateway);
  process.exit(1);
}
console.log(`→ 生产 Web 已由 Go 接管：127.0.0.1:${apiPort}  dist=${webDistDir}  data=${appDataDir}`);
