#!/usr/bin/env node
/**
 * 生产 Web：托管已构建的 tools/build/ui，并由同一 Node 进程提供 /api 与 /storage。
 * Nginx 应反代到 127.0.0.1:PORT，不要把 PORT 直接暴露公网。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureAppDatabase,
  resolveAccessToken,
  resolveAppDataDir,
  startApiServer,
} from './web-shared.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const webDistDir = process.env.WEB_DIST_DIR || join(workspaceRoot, 'tools/build/ui');
const appDataDir = process.env.AZHUO_DATA_DIR || resolveAppDataDir();
const apiPort = Number.parseInt(process.env.PORT || '3000', 10);

if (!existsSync(join(webDistDir, 'index.html'))) {
  console.error(`找不到前端构建产物：${webDistDir}/index.html`);
  console.error('请先在仓库根目录执行：pnpm run build:ui');
  process.exit(1);
}

ensureAppDatabase(workspaceRoot, appDataDir);
const accessToken = process.env.LOCAL_ACCESS_TOKEN || resolveAccessToken(workspaceRoot, appDataDir);

const child = startApiServer({
  workspaceRoot,
  apiPort,
  appDataDir,
  accessToken,
  watch: false,
  extraEnv: {
    NODE_ENV: process.env.NODE_ENV || 'production',
    WEB_DIST_DIR: webDistDir,
    HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
    PUBLIC_WEB_ORIGIN: process.env.PUBLIC_WEB_ORIGIN || '',
  },
});

const stop = (signal) => {
  if (child?.pid) child.kill(signal);
};

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

console.log(`→ 生产 Web 启动中：127.0.0.1:${apiPort}  dist=${webDistDir}  data=${appDataDir}`);
