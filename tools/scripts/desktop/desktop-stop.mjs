#!/usr/bin/env node
/**
 * 停止桌面开发后台服务（API / Vite，可选 Tauri）。
 */
import {
  clearPidFile,
  getRepoRoot,
  isProcessAlive,
  readPidFile,
  stopApiServer,
  stopTauriApp,
  stopViteServer,
} from './desktop-dev-shared.mjs';

const root = getRepoRoot();
const stopAll = process.argv.includes('--all');
const pids = readPidFile(root) || {};

function killPid(pid, label) {
  if (!pid || !isProcessAlive(pid)) return false;
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`→ 已停止 ${label} (PID ${pid})`);
    return true;
  } catch {
    return false;
  }
}

let stopped = 0;

if (killPid(pids.api, 'API')) stopped += 1;
if (killPid(pids.vite, 'Vite')) stopped += 1;

if (stopped === 0) {
  console.log('→ 按 PID 文件未找到存活进程，尝试按进程名停止…');
}

await stopApiServer();
stopViteServer();

if (stopAll) {
  stopTauriApp();
  console.log('→ 已尝试停止 Tauri (azhuo-workbench)');
}

clearPidFile(root);

console.log('');
console.log('开发后台服务已停止。运行 npm run desktop:status 确认。');
console.log('');
