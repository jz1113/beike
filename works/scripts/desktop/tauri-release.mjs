#!/usr/bin/env node
/**
 * 正式发版打包：可选注入 Apple / Windows 签名环境变量后执行 tauri build。
 *
 * macOS:
 *   export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
 *   export APPLE_PROVIDER_SHORT_NAME="..."  # 可选，notarization
 *
 * Windows:
 *   set TAURI_SIGNING_PRIVATE_KEY=...
 *   set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const signingHints = [];
if (process.platform === 'darwin' && !process.env.APPLE_SIGNING_IDENTITY) {
  signingHints.push('未设置 APPLE_SIGNING_IDENTITY，将产出未签名 macOS 包（Gatekeeper 需右键打开）');
}
if (process.platform === 'win32' && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  signingHints.push('未设置 TAURI_SIGNING_PRIVATE_KEY，将产出未签名 Windows 包');
}
if (signingHints.length) {
  console.warn('[release] 签名提示:\n - ' + signingHints.join('\n - '));
}

const result = spawnSync('npm', ['run', 'tauri:build'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: { ...process.env },
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
