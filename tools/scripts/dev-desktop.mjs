#!/usr/bin/env node
/**
 * Tauri beforeDevCommand：启动 Hono API（127.0.0.1）与 Vite UI（5173）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthOk, readDesktopPort } from './desktop-port.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const apiPort = readDesktopPort(root);
const vitePort = 5173;
const APP_IDENTIFIER = 'com.azhuo.workbench';

/** 与 Tauri app.path().app_data_dir() 对齐的 dev 数据目录 */
function resolveAppDataDir() {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_IDENTIFIER);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, APP_IDENTIFIER);
  }
  return join(home, '.local', 'share', APP_IDENTIFIER);
}

function ensureDesktopDb(appDataDir) {
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(join(appDataDir, 'storage'), { recursive: true });

  const targetDb = join(appDataDir, 'azhuo.db');
  const devDb = join(root, 'prisma', 'dev.db');

  if (!existsSync(targetDb) && existsSync(devDb)) {
    copyFileSync(devDb, targetDb);
    console.log(`→ 已迁移 dev 数据库至桌面数据目录：${targetDb}`);
    return;
  }

  if (existsSync(targetDb) && existsSync(devDb)) {
    try {
      const targetStat = statSync(targetDb);
      const devStat = statSync(devDb);
      if (devStat.mtimeMs > targetStat.mtimeMs && devStat.size > targetStat.size) {
        copyFileSync(devDb, targetDb);
        console.log(`→ dev.db 较新，已同步至桌面数据目录`);
      }
    } catch {
      /* ignore stat errors */
    }
  }
}

const appDataDir = resolveAppDataDir();
ensureDesktopDb(appDataDir);
const desktopDatabaseUrl = `file:${join(appDataDir, 'azhuo.db')}`;

const devTokenPath = join(root, '.desktop-dev-token');
let devAccessToken = '';
try {
  devAccessToken = readFileSync(devTokenPath, 'utf8').trim();
} catch {
  devAccessToken = randomBytes(32).toString('hex');
  writeFileSync(devTokenPath, `${devAccessToken}\n`, { mode: 0o600 });
  console.log('→ 已生成开发用随机 access token（.desktop-dev-token）');
}

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) {
      console.log(`✓ ${label}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`✗ ${label} 启动超时`);
  return false;
}

async function viteOk() {
  try {
    const res = await fetch(`http://127.0.0.1:${vitePort}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/** 仅停止本项目的 Hono API，避免 lsof -ti :port 误杀 Tauri/npm 进程 */
async function stopApiServer() {
  if (process.platform === 'win32') {
    spawnSync(
      'taskkill',
      ['/F', '/FI', 'WINDOWTITLE eq beike-api*'],
      { stdio: 'ignore', shell: true },
    );
    return;
  }
  spawnSync('pkill', ['-f', 'tsx server/index.ts'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
}

function startApiServer() {
  spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      PORT: String(apiPort),
      HOSTNAME: '127.0.0.1',
      DESKTOP_SHELL: '1',
      AZHUO_DATA_DIR: appDataDir,
      DATABASE_URL: desktopDatabaseUrl,
      LOCAL_ACCESS_TOKEN: devAccessToken,
    },
  }).unref();
}

const apiWasUp = await healthOk(apiPort);
if (apiWasUp) {
  console.log(`→ 重启 API 以加载最新代码（127.0.0.1:${apiPort}）…`);
  await stopApiServer();
} else {
  console.log(`→ 启动 API 服务（127.0.0.1:${apiPort}）…`);
}

startApiServer();
if (!(await waitFor(() => healthOk(apiPort), `API http://127.0.0.1:${apiPort}`))) {
  process.exit(1);
}

if (!(await viteOk())) {
  console.log(`→ 启动 Vite UI（127.0.0.1:${vitePort}）…`);
  spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      VITE_APP_ACCESS_TOKEN: devAccessToken,
    },
  }).unref();
  if (!(await waitFor(viteOk, `Vite http://127.0.0.1:${vitePort}`))) {
    process.exit(1);
  }
} else {
  console.log(`✓ 复用已有 Vite：http://127.0.0.1:${vitePort}`);
}

process.exit(0);
