#!/usr/bin/env node
/**
 * 本机 Web 运行环境共享逻辑：数据目录、访问令牌、health 检查、API/Vite 启停。
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordWebProcess, stopWebProcess } from './web-processes.mjs';

export const APP_IDENTIFIER = 'com.azhuo.workbench';
export const VITE_PORT = 5173;
export const PORT_MIN = 3000;
export const PORT_MAX = 3099;

const scriptDir = dirname(fileURLToPath(import.meta.url));

export function getWorkspaceRoot() {
  return join(scriptDir, '../../..');
}

/** 所有 CLI 从唯一的根依赖清单解析。 */
export function resolveCli(workspaceRoot, packageName, binName) {
  try {
    const require = createRequire(join(workspaceRoot, 'package.json'));
    const manifestPath = require.resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
    if (!bin) throw new Error('CLI 未声明');
    const cli = join(dirname(manifestPath), bin);
    if (!existsSync(cli)) throw new Error('CLI 文件不存在');
    return cli;
  } catch (error) {
    throw new Error(
      `无法加载 ${packageName} 启动依赖。请在项目根目录运行 pnpm install --frozen-lockfile --prod=false 后重试。`,
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

export function ensureAppDatabase(_workspaceRoot, appDataDir) {
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(join(appDataDir, 'storage'), { recursive: true });
  // New databases are initialized by the API's versioned migration runner.
  // Never copy a live SQLite main file without its WAL or overwrite user data.
}

export function resolveAccessToken(root, appDataDir, { isolated = false } = {}) {
  const tokenFile = join(appDataDir, 'access.token');
  const legacyTokenPath = join(root, '.local-api-token');
  let token = '';

  for (const file of isolated ? [tokenFile] : [tokenFile, legacyTokenPath]) {
    if (token || !existsSync(file)) continue;
    try {
      token = readFileSync(file, 'utf8').trim();
    } catch { throw new Error('本地访问令牌读取失败，请检查数据目录权限'); }
  }
  if (!token) token = randomBytes(32).toString('hex');

  mkdirSync(appDataDir, { recursive: true });
  const temporary = `${tokenFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, `${token}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, tokenFile);
    chmodSync(tokenFile, 0o600);
  } finally { rmSync(temporary, { force: true }); }

  return token;
}

export function getLogPaths(appDataDir) {
  return {
    api: join(appDataDir, 'api-dev.log'),
    vite: join(appDataDir, 'vite-dev.log'),
  };
}

const PORT_FILE = '.local-api-port';

export function readApiPort(root, { isolated = false } = {}) {
  try {
    const file = isolated ? join(root, '.local', 'isolated-api-port') : join(root, PORT_FILE);
    const n = Number.parseInt(readFileSync(file, 'utf8').trim(), 10);
    if (Number.isInteger(n) && n >= PORT_MIN && n <= PORT_MAX) return n;
  } catch {
    /* use default */
  }
  return isolated ? PORT_MIN + 1 : PORT_MIN;
}

export function writeApiPort(root, port, { isolated = false } = {}) {
  if (isolated) mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(isolated ? join(root, '.local', 'isolated-api-port') : join(root, PORT_FILE), String(port), 'utf8');
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

/** Stop only this workspace's recorded development watcher, never a production API. */
export function stopApiServer(workspaceRoot, { isolated = false } = {}) {
  return stopWebProcess(workspaceRoot, 'api', isolated);
}

export function webProcessOptions({ apiPort, appDataDir, accessToken }) {
  return { apiPort, appDataDir: resolve(appDataDir), tokenFingerprint: createHash('sha256').update(accessToken).digest('hex') };
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
    BEIKE_WEB_LAUNCH: '1',
    ...extra,
  };
}

export function startApiServer({ workspaceRoot, apiPort, appDataDir, accessToken, watch = true, extraEnv, isolated = false }) {
  const tsxCli = resolveCli(workspaceRoot, 'tsx', 'tsx');
  const args = ['--max-old-space-size=2048', '--expose-gc', tsxCli];
  if (watch) args.push('watch');
  args.push('--tsconfig', join(workspaceRoot, 'tsconfig.json'), join(workspaceRoot, 'src/server/index.ts'));
  const child = spawn(process.execPath, args, {
    cwd: workspaceRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: buildApiEnv({ apiPort, appDataDir, accessToken, extra: extraEnv }),
  });
  if (watch) recordWebProcess(workspaceRoot, 'api', child, webProcessOptions({ apiPort, appDataDir, accessToken }), isolated);
  return child;
}

export function startViteServer({ workspaceRoot, accessToken, apiPort, appDataDir, vitePort = VITE_PORT, isolated = false }) {
  const viteCli = resolveCli(workspaceRoot, 'vite', 'vite');
  const child = spawn(process.execPath, [viteCli, '--config', join(workspaceRoot, 'vite.config.ts'), '--strictPort', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      VITE_APP_ACCESS_TOKEN: accessToken,
      BEIKE_DEV_API_PORT: String(apiPort),
    },
  });
  recordWebProcess(workspaceRoot, 'vite', child, { ...webProcessOptions({ apiPort, appDataDir, accessToken }), vitePort }, isolated);
  return child;
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
