#!/usr/bin/env node
/** Copy the current Node binary into src-tauri/binaries with the Rust host triple. */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const binariesDir = join(root, 'src-tauri', 'binaries');
const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error('rustc not found. Install Rust from https://rustup.rs/');
  process.exit(1);
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
