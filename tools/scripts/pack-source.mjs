#!/usr/bin/env node
/**
 * Create a source-only archive (excludes node_modules, target, sidecar binaries).
 * Output: ../贝壳云图-源码-<date>.tar.gz
 *
 * Set WITH_GIT=1 to include .git history (larger archive).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const parent = dirname(root);
const folderName = basename(root);
const date = new Date().toISOString().slice(0, 10);
const outName = `贝壳云图-源码-${date}.tar.gz`;
const outPath = join(parent, outName);

const excludes = [
  'node_modules',
  'src-tauri/target',
  'src-tauri/binaries',
  'dist',
  '.DS_Store',
  '.desktop-dev-port',
];
if (process.env.WITH_GIT !== '1') {
  excludes.push('.git');
}

const args = ['-czf', outPath, ...excludes.flatMap((e) => ['--exclude', e]), folderName];

console.log(`→ packing ${outPath}${process.env.WITH_GIT === '1' ? ' (with .git)' : ''}`);
const r = spawnSync('tar', args, { cwd: parent, stdio: 'inherit' });
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
console.log(`✓ ${outPath}`);
