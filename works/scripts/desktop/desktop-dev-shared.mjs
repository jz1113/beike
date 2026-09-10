#!/usr/bin/env node
/**
 * 桌面开发环境共享逻辑：数据目录、health 检查、PID 文件、API/Vite 启停。
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthOk } from './desktop-port.mjs';

export const APP_IDENTIFIER = 'com.azhuo.workbench';
export const VITE_PORT = 5173;
export const PID_FILE = '.desktop-dev-pids.json';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export function getWorkspaceRoot() {
  return join(scriptDir, '../../..');
}

/** 从依赖所属 workspace 解析 CLI，兼容 pnpm 隔离安装和 npm 提升安装。 */
export function resolveDevCli(workspaceRoot, packageName, binName, workspace = '.') {
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
    throw new Error(`无法加载 ${packageName} 启动依赖（${workspace}）。请在项目根目录运行 pnpm install --frozen-lockfile --prod=false 后重试。`, { cause: error });
  }
}

export function getRepoRoot() {
  return getWorkspaceRoot();
}

/** 与 Tauri app.path().app_data_dir() 对齐的 dev 数据目录 */
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

function syncDesktopDbSchema(workspaceRoot, targetDb) {
  const schemaPath = join(workspaceRoot, 'db', 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) return;

  console.log('→ prisma db push (desktop azhuo.db)');
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'push', '--schema', schemaPath, '--skip-generate', '--accept-data-loss'],
    {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DATABASE_URL: `file:${targetDb}`,
    },
  });

  if (result.status !== 0) {
    const err = String(result.stderr || result.stdout || '').trim().split('\n').slice(-2).join(' ');
    console.warn(`→ prisma db push 未完全成功${err ? `：${err}` : ''}`);
  }
}

export function ensureDesktopDb(workspaceRoot, appDataDir) {
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(join(appDataDir, 'storage'), { recursive: true });

  const targetDb = join(appDataDir, 'azhuo.db');
  const devDb = join(workspaceRoot, 'db', 'prisma', 'dev.db');

  if (!existsSync(targetDb) && existsSync(devDb)) {
    copyFileSync(devDb, targetDb);
    console.log(`→ 已迁移 dev 数据库至桌面数据目录：${targetDb}`);
    syncDesktopDbSchema(workspaceRoot, targetDb);
    return;
  }

  if (existsSync(targetDb) && existsSync(devDb)) {
    try {
      const targetStat = statSync(targetDb);
      const devStat = statSync(devDb);
      if (devStat.mtimeMs > targetStat.mtimeMs && devStat.size > targetStat.size) {
        copyFileSync(devDb, targetDb);
        console.log('→ dev.db 较新，已同步至桌面数据目录');
      }
    } catch {
      /* ignore stat errors */
    }
  }

  syncDesktopDbSchema(workspaceRoot, targetDb);
}

export function resolveDevAccessToken(root, appDataDir) {
  const desktopTokenFile = join(appDataDir, 'access.token');
  const devTokenPath = join(root, '.desktop-dev-token');
  let devAccessToken = '';

  if (existsSync(desktopTokenFile)) {
    try {
      devAccessToken = readFileSync(desktopTokenFile, 'utf8').trim();
    } catch {
      /* ignore */
    }
  }
  if (!devAccessToken && existsSync(devTokenPath)) {
    try {
      devAccessToken = readFileSync(devTokenPath, 'utf8').trim();
    } catch {
      /* ignore */
    }
  }
  if (!devAccessToken) {
    devAccessToken = randomBytes(32).toString('hex');
  }

  try {
    writeFileSync(devTokenPath, `${devAccessToken}\n`, { mode: 0o600 });
    writeFileSync(desktopTokenFile, `${devAccessToken}\n`, { mode: 0o600 });
  } catch {
    /* ignore */
  }

  return devAccessToken;
}

export function getLogPaths(appDataDir) {
  return {
    api: join(appDataDir, 'api-dev.log'),
    vite: join(appDataDir, 'vite-dev.log'),
  };
}

export function pidFilePath(root) {
  return join(root, PID_FILE);
}

export function readPidFile(root) {
  try {
    const raw = readFileSync(pidFilePath(root), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writePidFile(root, pids) {
  const existing = readPidFile(root) || {};
  writeFileSync(
    pidFilePath(root),
    `${JSON.stringify({ ...existing, ...pids, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

export function clearPidFile(root) {
  try {
    writeFileSync(pidFilePath(root), '{}\n', 'utf8');
  } catch {
    /* ignore */
  }
}

export function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function viteOk(vitePort = VITE_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${vitePort}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/** 检测端口是否被占用（含僵尸 Vite：监听但返回非 2xx） */
export function isVitePortOccupied(vitePort = VITE_PORT) {
  if (process.platform === 'win32') return false;
  const result = spawnSync('lsof', ['-ti', `:${vitePort}`], { encoding: 'utf8' });
  return String(result.stdout || '').trim().length > 0;
}

export async function waitFor(fn, label, timeoutMs = 60000, child = null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child && (child.exitCode !== null || child.signalCode !== null || !child.pid)) {
      console.error(`✗ ${label} 启动进程已退出，请查看上方错误或开发日志`);
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

/** 仅停止本项目的 Hono API，避免 lsof -ti :port 误杀 Tauri/npm 进程 */
export async function stopApiServer(apiPort = 3000) {
  if (process.platform === 'win32') {
    const pids = readPidFile(getRepoRoot());
    if (pids?.api && isProcessAlive(pids.api)) {
      killChild({ pid: pids.api });
    }
    try {
      const out = spawnSync('cmd.exe', ['/c', `netstat -ano | findstr :${apiPort}`], { encoding: 'utf8' });
      const lines = (out.stdout || '').split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].includes(`:${apiPort}`) && parts[3] === 'LISTENING') {
          const pid = Number.parseInt(parts[4], 10);
          if (Number.isFinite(pid) && pid > 0) {
            spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
          }
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }
  spawnSync('pkill', ['-f', 'tsx.*app/api/src/index.ts'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'app/api/src/index.ts'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'infer_video_depth.py'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
}

export function stopViteServer(vitePort = VITE_PORT, { force = false } = {}) {
  if (process.platform === 'win32') {
    const pids = readPidFile(getRepoRoot());
    if (pids?.vite && isProcessAlive(pids.vite)) {
      killChild({ pid: pids.vite });
    }
    try {
      const out = spawnSync('cmd.exe', ['/c', `netstat -ano | findstr :${vitePort}`], { encoding: 'utf8' });
      const lines = (out.stdout || '').split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].includes(`:${vitePort}`) && parts[3] === 'LISTENING') {
          const pid = Number.parseInt(parts[4], 10);
          if (Number.isFinite(pid) && pid > 0) {
            spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
          }
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }
  const result = spawnSync('lsof', ['-ti', `:${vitePort}`], { encoding: 'utf8' });
  const pids = String(result.stdout || '')
    .split(/\s+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  for (const pid of pids) {
    try {
      if (force) {
        process.kill(pid, 'SIGTERM');
        continue;
      }
      const ps = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
      const cmd = String(ps.stdout || '');
      if (/vite/i.test(cmd)) {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      /* ignore */
    }
  }
}

export function stopTauriApp() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/IM', 'azhuo-workbench.exe'], { stdio: 'ignore' });
    return;
  }
  spawnSync('pkill', ['-f', 'azhuo-workbench'], { stdio: 'ignore' });
}

export function findTauriPid() {
  if (process.platform === 'win32') {
    try {
      const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq azhuo-workbench.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      const line = (out.stdout || '').trim().split('\n')[0];
      if (line && line.includes('azhuo-workbench.exe')) {
        const parts = line.split(',');
        const pid = Number.parseInt(parts[1]?.replace(/"/g, ''), 10);
        return Number.isFinite(pid) ? pid : null;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  const result = spawnSync('pgrep', ['-f', 'azhuo-workbench'], { encoding: 'utf8' });
  const pid = Number.parseInt(String(result.stdout || '').trim().split('\n')[0], 10);
  return Number.isFinite(pid) ? pid : null;
}

function pipeWithPrefix(stream, prefix, logFile, rawLogFd) {
  let buffer = '';
  stream.on('data', (chunk) => {
    if (rawLogFd != null) {
      try {
        writeSync(rawLogFd, chunk);
      } catch {
        /* ignore */
      }
    }
    const text = buffer + chunk.toString();
    const lines = text.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      const out = `${prefix} ${line}`;
      console.log(out);
      // rawLogFd 已写入原始日志，避免重复
      if (logFile && rawLogFd == null) {
        try {
          appendFileSync(logFile, `${out}\n`);
        } catch {
          /* ignore */
        }
      }
    }
  });
}

function attachPrefixedLogging(child, prefix, logFile, rawLogFd) {
  if (child.stdout) pipeWithPrefix(child.stdout, prefix, logFile, rawLogFd);
  if (child.stderr) pipeWithPrefix(child.stderr, prefix, logFile, rawLogFd);
  child.on('exit', (code, signal) => {
    const msg = `${prefix} 进程退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
    console.log(msg);
    if (logFile) {
      try {
        appendFileSync(logFile, `${msg}\n`);
      } catch {
        /* ignore */
      }
    }
  });
}

export function startApiServerManaged({ workspaceRoot, apiPort, appDataDir, devAccessToken, logFile }) {
  const tsxCli = resolveDevCli(workspaceRoot, 'tsx', 'tsx');
  const desktopDatabaseUrl = `file:${join(appDataDir, 'azhuo.db')}`;
  const out = openSync(logFile, 'a');
  const child = spawn(
    process.execPath,
    ['--max-old-space-size=2048', '--expose-gc', tsxCli, 'watch', '--tsconfig', 'tsconfig.json', 'app/api/src/index.ts'],
    {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=2048 --expose-gc`.trim(),
        PORT: String(apiPort),
        HOSTNAME: '127.0.0.1',
        DESKTOP_SHELL: '1',
        AZHUO_DATA_DIR: appDataDir,
        DATABASE_URL: desktopDatabaseUrl,
        LOCAL_ACCESS_TOKEN: devAccessToken,
      },
    },
  );
  attachPrefixedLogging(child, '[api]', logFile, out);
  return child;
}

export function startApiServerDetached({ workspaceRoot, apiPort, appDataDir, devAccessToken, logFile }) {
  const tsxCli = resolveDevCli(workspaceRoot, 'tsx', 'tsx');
  const desktopDatabaseUrl = `file:${join(appDataDir, 'azhuo.db')}`;
  const out = openSync(logFile, 'a');
  const child = spawn(
    process.execPath,
    ['--max-old-space-size=2048', '--expose-gc', tsxCli, 'watch', '--tsconfig', 'tsconfig.json', 'app/api/src/index.ts'],
    {
      cwd: workspaceRoot,
      stdio: ['ignore', out, out],
      detached: true,
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=2048 --expose-gc`.trim(),
        PORT: String(apiPort),
        HOSTNAME: '127.0.0.1',
        DESKTOP_SHELL: '1',
        AZHUO_DATA_DIR: appDataDir,
        DATABASE_URL: desktopDatabaseUrl,
        LOCAL_ACCESS_TOKEN: devAccessToken,
      },
    },
  );
  child.unref();
  return child;
}

export function startViteServerManaged({ workspaceRoot, devAccessToken, logFile, vitePort = VITE_PORT }) {
  const viteCli = resolveDevCli(workspaceRoot, 'vite', 'vite', 'app/web');
  const out = openSync(logFile, 'a');
  const child = spawn(process.execPath, [viteCli, '--strictPort', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: join(workspaceRoot, 'app', 'web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VITE_APP_ACCESS_TOKEN: devAccessToken,
    },
  });
  attachPrefixedLogging(child, '[vite]', logFile, out);
  return child;
}

export function startViteServerDetached({ workspaceRoot, devAccessToken, logFile, vitePort = VITE_PORT }) {
  const viteCli = resolveDevCli(workspaceRoot, 'vite', 'vite', 'app/web');
  const viteOut = openSync(logFile, 'a');
  const child = spawn(process.execPath, [viteCli, '--strictPort', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: join(workspaceRoot, 'app', 'web'),
    stdio: ['ignore', viteOut, viteOut],
    detached: true,
    env: {
      ...process.env,
      VITE_APP_ACCESS_TOKEN: devAccessToken,
    },
  });
  child.unref();
  return child;
}

export async function ensureDevServices({
  apiPort,
  mode = 'managed',
  onApiChild,
  onViteChild,
}) {
  const workspaceRoot = getWorkspaceRoot();
  const repoRoot = getRepoRoot();
  const appDataDir = resolveAppDataDir();
  // 在数据库同步或服务重启之前检查依赖，避免启动到一半才失败。
  try {
    resolveDevCli(workspaceRoot, 'tsx', 'tsx');
    resolveDevCli(workspaceRoot, 'vite', 'vite', 'app/web');
  } catch (error) {
    console.error(`✗ ${error.message}`);
    return { ok: false, appDataDir, logs: getLogPaths(appDataDir) };
  }
  ensureDesktopDb(workspaceRoot, appDataDir);
  const devAccessToken = resolveDevAccessToken(repoRoot, appDataDir);
  const logs = getLogPaths(appDataDir);

  const apiWasUp = await healthOk(apiPort);
  if (apiWasUp) {
    console.log(`→ 重启 API 以加载最新代码（127.0.0.1:${apiPort}）…`);
    await stopApiServer();
  } else {
    console.log(`→ 启动 API 服务（127.0.0.1:${apiPort}）…`);
  }

  const startApi = mode === 'managed' ? startApiServerManaged : startApiServerDetached;
  const apiChild = startApi({
    workspaceRoot,
    apiPort,
    appDataDir,
    devAccessToken,
    logFile: logs.api,
  });
  onApiChild?.(apiChild);
  if (apiChild.pid) writePidFile(repoRoot, { api: apiChild.pid, apiPort });

  if (!(await waitFor(() => healthOk(apiPort), `API http://127.0.0.1:${apiPort}`, 60000, apiChild))) {
    return { ok: false, appDataDir, logs, devAccessToken };
  }

  let viteChild = null;
  const viteHealthy = await viteOk();
  const vitePortBusy = isVitePortOccupied();
  if (!viteHealthy) {
    if (vitePortBusy) {
      console.log(`→ 清理占用 ${VITE_PORT} 端口的旧 Vite 进程…`);
      stopViteServer(VITE_PORT, { force: true });
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`→ 启动 Vite UI（127.0.0.1:${VITE_PORT}）…`);
    const startVite = mode === 'managed' ? startViteServerManaged : startViteServerDetached;
    viteChild = startVite({
      workspaceRoot,
      devAccessToken,
      logFile: logs.vite,
    });
    onViteChild?.(viteChild);
    if (viteChild.pid) writePidFile(repoRoot, { vite: viteChild.pid, vitePort: VITE_PORT });
    if (!(await waitFor(viteOk, `Vite http://127.0.0.1:${VITE_PORT}`, 60000, viteChild))) {
      return { ok: false, appDataDir, logs, devAccessToken, apiChild, viteChild };
    }
  } else {
    console.log(`✓ 复用已有 Vite：http://127.0.0.1:${VITE_PORT}`);
  }

  return { ok: true, appDataDir, logs, devAccessToken, apiChild, viteChild };
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

export { healthOk };
