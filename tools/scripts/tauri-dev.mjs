#!/usr/bin/env node
/**
 * 解析桌面 dev 端口、写入 Tauri 临时配置，再启动 `tauri dev`。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthOk, resolveDesktopPort, writeDesktopPort } from './desktop-port.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const baseConfigPath = join(root, 'src-tauri', 'tauri.conf.json');
const devConfigPath = join(root, 'src-tauri', 'tauri.conf.dev.json');

const apiPort = await resolveDesktopPort();
writeDesktopPort(root, apiPort);

const base = JSON.parse(readFileSync(baseConfigPath, 'utf8'));
base.build = {
  ...base.build,
  beforeDevCommand: 'npm run dev:desktop',
  devUrl: 'http://127.0.0.1:5173',
};
writeFileSync(devConfigPath, `${JSON.stringify(base, null, 2)}\n`, 'utf8');

console.log(`→ 桌面 UI: http://127.0.0.1:5173  |  API: http://127.0.0.1:${apiPort}`);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tauri', 'dev', '--config', devConfigPath],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, AZHUO_DESKTOP_PORT: String(apiPort) },
  },
);

process.exit(result.status ?? 1);
