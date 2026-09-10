#!/usr/bin/env node
/** Copy the current Node binary into apps/desktop/binaries with the Rust host triple. */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeBundledNodeModules } from './sanitize-api-server-bundle.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const binariesDir = join(workspaceRoot, 'desktop', 'binaries');
const apiServerModules = join(workspaceRoot, 'desktop', 'resources', 'api-server', 'node_modules');

const removed = sanitizeBundledNodeModules(apiServerModules);
if (removed > 0) {
  console.log(`→ sanitized api-server node_modules (removed ${removed} broken link(s) / .bin dir(s))`);
}
const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.warn('[desktop] rustc 未安装，跳过桌面原生 sidecar 准备（若需原生窗口请安装 Rust：https://rustup.rs/）');
  process.exit(0);
}
const match = String(result.stdout).match(/host: (\S+)/);
if (!match) {
  console.error('Could not parse rustc host triple.');
  process.exit(1);
}
const ext = process.platform === 'win32' ? '.exe' : '';
const dest = join(binariesDir, `node-${match[1]}${ext}`);
mkdirSync(binariesDir, { recursive: true });
if (!existsSync(dest)) {
  copyFileSync(process.execPath, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }
  console.log(`copied node sidecar → ${dest}`);
}
