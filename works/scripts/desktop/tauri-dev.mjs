#!/usr/bin/env node
/**
 * 桌面开发监督器：拉起 API / Vite、前缀日志输出，再启动 `tauri dev`。
 */
import { spawn, spawnSync, exec } from 'node:child_process';
import { existsSync, readFileSync, readlinkSync, rmSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDesktopPort, writeDesktopPort } from './desktop-port.mjs';
import {
  VITE_PORT,
  ensureDevServices,
  getRepoRoot,
  getWorkspaceRoot,
  killChild,
  stopTauriApp,
} from './desktop-dev-shared.mjs';

const repoRoot = getRepoRoot();
const workspaceRoot = getWorkspaceRoot();
const baseConfigPath = join(workspaceRoot, 'desktop', 'tauri.conf.json');
const devConfigPath = join(workspaceRoot, 'desktop', 'tauri.conf.dev.json');
const desktopTargetDir = join(workspaceRoot, 'desktop', 'target');
const devCacheMarker = join(desktopTargetDir, '.dev-workspace-root');

/** 项目迁移后清理失效的 cargo 缓存（旧路径、坏符号链接） */
function ensureTauriDevCache() {
  let needsClean = false;
  try {
    const saved = readFileSync(devCacheMarker, 'utf8').trim();
    if (saved !== workspaceRoot) needsClean = true;
  } catch {
    /* 首次运行或 marker 不存在 */
  }

  const apiServerDir = join(workspaceRoot, 'desktop', 'resources', 'api-server');
  if (existsSync(apiServerDir)) {
    const semverLink = join(apiServerDir, 'node_modules', 'sharp', 'node_modules', '.bin', 'semver');
    if (existsSync(semverLink)) {
      try {
        const linkTarget = readlinkSync(semverLink);
        if (!existsSync(linkTarget)) needsClean = true;
      } catch {
        needsClean = true;
      }
    }
  }

  if (needsClean && existsSync(desktopTargetDir)) {
    console.log('→ 检测到开发构建缓存已过期，正在清理 cargo target…');
    rmSync(desktopTargetDir, { recursive: true, force: true });
  }

  mkdirSync(desktopTargetDir, { recursive: true });
  writeFileSync(devCacheMarker, `${workspaceRoot}\n`, 'utf8');
}

/** 确保 macOS 本地化资源（zh-Hans.lproj 与 Info.plist）同步到开发输出目录，使系统弹窗完整中文显示 */
function syncDevLocalization() {
  const targetDebug = join(desktopTargetDir, 'debug');
  mkdirSync(targetDebug, { recursive: true });
  const resourcesDir = join(workspaceRoot, 'desktop', 'resources');
  for (const lproj of ['zh-Hans.lproj', 'zh_CN.lproj', 'zh.lproj']) {
    const src = join(resourcesDir, lproj);
    const dest = join(targetDebug, lproj);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true, force: true });
    }
  }
  const infoPlist = join(workspaceRoot, 'desktop', 'Info.plist');
  if (existsSync(infoPlist)) {
    copyFileSync(infoPlist, join(targetDebug, 'Info.plist'));
  }
}

function writeDevConfig() {
  const base = JSON.parse(readFileSync(baseConfigPath, 'utf8'));
  base.build = {
    ...base.build,
    beforeDevCommand: 'node works/scripts/desktop/dev-desktop-ready.mjs',
    devUrl: `http://127.0.0.1:${VITE_PORT}`,
  };
  // 开发模式由监督器拉起 API/Vite，无需打包 sidecar 与 api-server 资源
  base.bundle = {
    ...base.bundle,
    resources: (base.bundle?.resources ?? []).filter(
      (r) => typeof r === 'string' && r.includes('.lproj'),
    ),
    externalBin: [],
  };
  writeFileSync(devConfigPath, `${JSON.stringify(base, null, 2)}\n`, 'utf8');
}

ensureTauriDevCache();
syncDevLocalization();
writeDevConfig();
stopTauriApp();

const apiPort = await resolveDesktopPort();
writeDesktopPort(repoRoot, apiPort);

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let viteChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let tauriChild = null;
let shuttingDown = false;

function cleanupChildren() {
  killChild(apiChild);
  killChild(viteChild);
  apiChild = null;
  viteChild = null;
}

function onSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n→ 收到 ${signal}，正在停止开发服务…`);
  if (tauriChild && !tauriChild.killed) {
    try {
      tauriChild.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  cleanupChildren();
  process.exit(130);
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

const services = await ensureDevServices({
  apiPort,
  mode: 'managed',
  onApiChild: (child) => {
    apiChild = child;
  },
  onViteChild: (child) => {
    viteChild = child;
  },
});

if (!services.ok) {
  cleanupChildren();
  process.exit(1);
}

const apiPid = apiChild?.pid ?? '—';
const vitePid = services.viteChild?.pid ?? viteChild?.pid ?? '复用';

console.log('');
console.log('=========================================================');
console.log('   贝壳云图 · 桌面开发环境已就绪');
console.log('=========================================================');
console.log(`   UI    http://127.0.0.1:${VITE_PORT}   PID ${vitePid}`);
console.log(`   API   http://127.0.0.1:${apiPort}   PID ${apiPid}`);
console.log(`   日志  ${services.logs.api}`);
console.log(`         ${services.logs.vite}`);
console.log('   状态  npm run desktop:status');
console.log('   停止  npm run desktop:stop');
console.log('=========================================================');
console.log('');

const hasRust =
  !process.argv.includes('--no-tauri') &&
  !process.argv.includes('--web') &&
  spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['rustc'], { stdio: 'ignore' }).status === 0;

if (hasRust) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const devArgs = ['tauri', 'dev', '--config', devConfigPath];
  if (process.platform === 'darwin') {
    // 传递 macOS 原生语言参数，确保开发模式下 NSOpenPanel / NSSavePanel 系统弹窗显示简体中文
    devArgs.push('--', '--', '-AppleLanguages', '(zh-Hans-CN, zh-Hans, zh_CN, zh)', '-AppleLocale', 'zh_CN');
  }
  tauriChild = spawn(npx, devArgs, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      AZHUO_DESKTOP_PORT: String(apiPort),
      LANG: 'zh_CN.UTF-8',
      LC_ALL: 'zh_CN.UTF-8',
    },
  });

  tauriChild.on('exit', (code, signal) => {
    console.log('');
    console.log('=========================================================');
    console.log(`   Tauri 已退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    console.log('=========================================================');
    console.log('→ 运行 npm run desktop:status 查看 API / Vite 是否仍在运行');
    console.log('→ 运行 npm run desktop:stop 停止后台服务');
    console.log('');

    spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'desktop-status.mjs')], {
      cwd: workspaceRoot,
      stdio: 'inherit',
    }).on('exit', () => {
      process.exit(code ?? 1);
    });
  });
} else {
  console.log('=========================================================');
  console.log('   提示：未检测到 Rust 编译环境 (rustc/cargo)');
  console.log('   已自动以「独立桌面原生窗口」模式启动贝壳云图');
  console.log('   （API 服务与全套功能均在后台完整运行）');
  console.log('   按 Ctrl+C 可停止全部开发服务');
  console.log('=========================================================');
  console.log('');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const openCmd =
    process.platform === 'win32'
      ? (existsSync(edgePath)
          ? `"${edgePath}" --app=http://127.0.0.1:${VITE_PORT}`
          : `start http://127.0.0.1:${VITE_PORT}`)
      : process.platform === 'darwin'
        ? `open -a "Google Chrome" --args --app=http://127.0.0.1:${VITE_PORT} || open http://127.0.0.1:${VITE_PORT}`
        : `xdg-open http://127.0.0.1:${VITE_PORT}`;
  exec(openCmd, () => {});
}
