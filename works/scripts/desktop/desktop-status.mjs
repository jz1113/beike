#!/usr/bin/env node
/**
 * 查看桌面开发环境（API / Vite / Tauri）运行状态。
 */
import { readFileSync } from 'node:fs';
import { readDesktopPort } from './desktop-port.mjs';
import {
  VITE_PORT,
  findTauriPid,
  getLogPaths,
  getRepoRoot,
  healthOk,
  isProcessAlive,
  readPidFile,
  resolveAppDataDir,
  viteOk,
} from './desktop-dev-shared.mjs';

const root = getRepoRoot();
const apiPort = readDesktopPort(root);
const appDataDir = resolveAppDataDir();
const logs = getLogPaths(appDataDir);
const pids = readPidFile(root) || {};
const brief = process.argv.includes('--brief');

function tailLog(path, lines = 10) {
  try {
    const text = readFileSync(path, 'utf8');
    const rows = text.trim().split('\n');
    return rows.slice(-lines);
  } catch {
    return [];
  }
}

/** 从日志尾部提取可读的错误摘要，跳过堆栈帧 */
function tailErrors(path, maxLines = 5) {
  const rows = tailLog(path, 40);
  const meaningful = rows.filter(
    (line) =>
      /Error|error|ERR_|失败|✗|Cannot find|already in use|启动超时/i.test(line) &&
      !/^\s+at\s/.test(line),
  );
  return meaningful.slice(-maxLines);
}

function statusMark(ok) {
  return ok ? '✓' : '✗';
}

const apiHealthy = await healthOk(apiPort);
const viteHealthy = await viteOk();
const apiPid = pids.api;
const vitePid = pids.vite;
const tauriPid = findTauriPid();

const apiAlive = isProcessAlive(apiPid);
const viteAlive = isProcessAlive(vitePid);
const tauriAlive = tauriPid != null && isProcessAlive(tauriPid);

const allOk = apiHealthy && viteHealthy;

if (brief) {
  const parts = [
    `API ${statusMark(apiHealthy)}`,
    `UI ${statusMark(viteHealthy)}`,
    `Tauri ${statusMark(tauriAlive)}`,
  ];
  console.log(parts.join(' · '));
  if (!allOk) {
    console.log('  → npm run desktop:stop && npm run tauri:dev');
  }
  process.exit(allOk ? 0 : 1);
}

console.log('');
console.log('贝壳云图 · 开发环境状态');
console.log('────────────────────────');
console.log(
  `API   http://127.0.0.1:${apiPort}  ${statusMark(apiHealthy)} ${apiHealthy ? 'healthy' : 'down'}  PID ${apiPid && apiAlive ? apiPid : '—'}`,
);
console.log(
  `UI    http://127.0.0.1:${VITE_PORT}  ${statusMark(viteHealthy)} ${viteHealthy ? 'ok' : 'down'}       PID ${vitePid && viteAlive ? vitePid : '—'}`,
);
console.log(
  `Tauri azhuo-workbench        ${statusMark(tauriAlive)} ${tauriAlive ? 'running' : 'stopped'}  PID ${tauriPid ?? '—'}`,
);
console.log(`日志  ${logs.api}`);

if (!allOk) {
  const apiErrors = tailErrors(logs.api);
  const viteErrors = !viteHealthy ? tailErrors(logs.vite) : [];
  if (apiErrors.length > 0) {
    console.log('');
    console.log('── API 最近错误 ──');
    for (const line of apiErrors) {
      console.log(`  ${line.replace(/^\[api\]\s*/, '')}`);
    }
  }
  if (viteErrors.length > 0) {
    console.log('');
    console.log('── Vite 最近错误 ──');
    for (const line of viteErrors) {
      console.log(`  ${line.replace(/^\[vite\]\s*/, '')}`);
    }
  }
  console.log('');
  console.log('建议：npm run desktop:stop && npm run tauri:dev');
}

console.log('');
process.exit(allOk ? 0 : 1);
