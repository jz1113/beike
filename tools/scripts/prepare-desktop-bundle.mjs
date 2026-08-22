#!/usr/bin/env node
/**
 * 组装 Vite 静态资源 + Hono API sidecar + Node binary，供 Tauri 打包。
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tauriDir = join(root, 'src-tauri');
const apiDir = join(tauriDir, 'resources', 'api-server');
const binariesDir = join(tauriDir, 'binaries');

const NATIVE_DEPS = [
  '.prisma',
  '@prisma',
  'sharp',
  '@img',
  'detect-libc',
  'semver',
  'mammoth',
  'unpdf',
  'xlsx',
  'jszip',
  '@aws-sdk',
  '@smithy',
  '@aws-crypto',
  'fast-xml-parser',
  'tslib',
  'uuid',
  'hono',
  '@hono',
];

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function rustHostTriple() {
  const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('rustc not found; install Rust to prepare desktop sidecar.');
    process.exit(1);
  }
  const match = String(result.stdout).match(/host: (\S+)/);
  if (!match) {
    console.error('Could not parse rustc host triple.');
    process.exit(1);
  }
  return match[1];
}

function copyNodeDeps(destModules) {
  mkdirSync(destModules, { recursive: true });
  for (const name of NATIVE_DEPS) {
    const src = join(root, 'node_modules', name);
    if (existsSync(src)) {
      cpSync(src, join(destModules, name), { recursive: true });
    }
  }
}

console.log('→ typecheck');
run('npx', ['tsc', '--noEmit']);

console.log('→ prisma generate');
run('npx', ['prisma', 'generate']);

console.log('→ vite build');
run('npx', ['vite', 'build']);

rmSync(apiDir, { recursive: true, force: true });
mkdirSync(apiDir, { recursive: true });

console.log('→ bundle Hono API server');
run('npx', [
  'esbuild',
  'server/index.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--packages=external',
  `--alias:@=${join(root, 'src')}`,
  '--outfile=src-tauri/resources/api-server/index.cjs',
]);

copyNodeDeps(join(apiDir, 'node_modules'));

mkdirSync(join(apiDir, 'prisma'), { recursive: true });
copyFileSync(join(root, 'prisma', 'schema.prisma'), join(apiDir, 'prisma', 'schema.prisma'));

const templateDb = join(apiDir, 'prisma', 'template.db');
rmSync(templateDb, { force: true });
console.log('→ prisma db push (template sqlite)');
run('npx', ['prisma', 'db', 'push', '--skip-generate'], {
  DATABASE_URL: `file:${templateDb}`,
});

mkdirSync(binariesDir, { recursive: true });
const triple = rustHostTriple();
const ext = process.platform === 'win32' ? '.exe' : '';
const sidecarDest = join(binariesDir, `node-${triple}${ext}`);
copyFileSync(process.execPath, sidecarDest);
try {
  chmodSync(sidecarDest, 0o755);
} catch {
  /* windows */
}

writeFileSync(
  join(apiDir, 'package.json'),
  JSON.stringify({ type: 'commonjs', name: 'beike-api-server' }, null, 2),
);

console.log(`→ sidecar node copied: ${sidecarDest}`);
console.log('→ desktop bundle ready (dist + api-server)');
