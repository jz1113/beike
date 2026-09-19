#!/usr/bin/env node
/**
 * 本机 Web 运行环境共享逻辑：数据目录、访问令牌、health 检查、API/Vite 启停。
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_IDENTIFIER = 'com.azhuo.workbench';
export const VITE_PORT = 5173;
export const PORT_MIN = 3000;
export const PORT_MAX = 3099;

const scriptDir = dirname(fileURLToPath(import.meta.url));

export function getWorkspaceRoot() {
  return join(scriptDir, '../../..');
}

/** 从依赖所属 workspace 解析 CLI，兼容 pnpm 隔离安装和 npm 提升安装。 */
export function resolveCli(workspaceRoot, packageName, binName, workspace = '.') {
  try {
    const require = createRequire(join(workspaceRoot, workspace, 'package.json'));
    const manifestPath = require.resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
    if (!bin) throw new Error('CLI 未声明');
    const cli = join(dirname(manifestPath), bin);
    if (!existsSync(cli)) throw new Error('CLI 文件不存在');
    return cli;
  } catch (error) {
    throw new Error(
      `无法加载 ${packageName} 启动依赖（${workspace}）。请在项目根目录运行 pnpm install --frozen-lockfile --prod=false 后重试。`,
      { cause: error },
    );
  }
}

/** 用户数据目录：与历史桌面版保持一致，升级后数据不迁移 */
export function resolveAppDataDir() {
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

export function ensureAppDatabase(workspaceRoot, appDataDir) {
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(join(appDataDir, 'storage'), { recursive: true });
  const targetDb = join(appDataDir, 'azhuo.db');
  const devDb = join(workspaceRoot, 'packages', 'prisma', 'dev.db');
  if (!existsSync(targetDb) && existsSync(devDb)) {
    copyFileSync(devDb, targetDb);
    console.log(`→ 已复制初始数据库：${targetDb}`);
  }
  // The API's versioned migration runner backs up and upgrades before listening.
}

export function resolveAccessToken(root, appDataDir) {
  const tokenFile = join(appDataDir, 'access.token');
  const legacyTokenPath = join(root, '.local-api-token');
  let token = '';

  for (const file of [tokenFile, legacyTokenPath]) {
    if (token || !existsSync(file)) continue;
    try {
      token = readFileSync(file, 'utf8').trim();
    } catch {
      /* ignore */
    }
  }
  if (!token) token = randomBytes(32).toString('hex');

  try {
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  } catch {
    /* ignore */
  }

  return token;
}

export function getLogPaths(appDataDir) {
  return {
    api: join(appDataDir, 'api-dev.log'),
    vite: join(appDataDir, 'vite-dev.log'),
  };
}

const PORT_FILE = '.local-api-port';

export function readApiPort(root) {
  try {
    const n = Number.parseInt(readFileSync(join(root, PORT_FILE), 'utf8').trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* use default */
  }
  return PORT_MIN;
}

export function writeApiPort(root, port) {
  writeFileSync(join(root, PORT_FILE), String(port), 'utf8');
}

export function healthOk(port) {
  return new Promise((resolve) => {
    const req = get(`http://127.0.0.1:${port}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

export async function viteOk(vitePort = VITE_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${vitePort}/`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitFor(fn, label, timeoutMs = 60000, child = null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child && (child.exitCode !== null || child.signalCode !== null || !child.pid)) {
      console.error(`✗ ${label} 启动进程已退出，请查看上方错误或运行日志`);
      return false;
    }
    if (await fn()) {
      console.log(`✓ ${label}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`✗ ${label} 启动超时`);
  return false;
}

/** 仅停止本项目的 Hono API，避免 lsof -ti :port 误杀其他进程 */
export async function stopApiServer() {
  if (process.platform === 'win32') {
    try {
      spawnSync('cmd.exe', ['/c', 'taskkill /F /FI "WINDOWTITLE eq beike-api"'], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    return;
  }
  spawnSync('pkill', ['-f', 'tsx.*apps/api/src/index.ts'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'apps/api/src/index.ts'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'infer_video_depth.py'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
}

export function buildApiEnv({ apiPort, appDataDir, accessToken, extra = {} }) {
  return {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=2048 --expose-gc`.trim(),
    PORT: String(apiPort),
    HOSTNAME: '127.0.0.1',
    AZHUO_DATA_DIR: appDataDir,
    DATABASE_URL: `file:${join(appDataDir, 'azhuo.db')}`,
    LOCAL_ACCESS_TOKEN: accessToken,
    ...extra,
  };
}

export function startApiServer({ workspaceRoot, apiPort, appDataDir, accessToken, watch = true, extraEnv }) {
  const tsxCli = resolveCli(workspaceRoot, 'tsx', 'tsx');
  const args = ['--max-old-space-size=2048', '--expose-gc', tsxCli];
  if (watch) args.push('watch');
  args.push('--tsconfig', 'tsconfig.json', 'apps/api/src/index.ts');
  return spawn(process.execPath, args, {
    cwd: workspaceRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: buildApiEnv({ apiPort, appDataDir, accessToken, extra: extraEnv }),
  });
}

export function startViteServer({ workspaceRoot, accessToken, vitePort = VITE_PORT }) {
  const viteCli = resolveCli(workspaceRoot, 'vite', 'vite', 'apps/web');
  return spawn(process.execPath, [viteCli, '--strictPort', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: join(workspaceRoot, 'apps', 'web'),
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      VITE_APP_ACCESS_TOKEN: accessToken,
    },
  });
}

export function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 用户可手动打开 */
  }
}

export function killChild(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
}
