#!/usr/bin/env node
/**
 * 组装 Vite 静态资源 + Hono API sidecar + Node binary，供 Tauri 打包。
 */
import {sanitizeStorageEnv} from './sanitize-storage-env.mjs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeBundledNodeModules } from './sanitize-api-server-bundle.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const tauriDir = join(workspaceRoot, 'desktop');
const apiDir = join(tauriDir, 'resources', 'api-server');
const binariesDir = join(tauriDir, 'binaries');


function run(cmd, args, options = {}) {
  const { env: extraEnv = {}, cwd = workspaceRoot } = options;
  // Execute local CLI entry points directly so Windows cmd.exe cannot split
  // paths or interpret the esbuild banner's spaces and parentheses.
  if (cmd === 'npx') {
    const cli = { tsc: 'typescript/bin/tsc', prisma: 'prisma/build/index.js',
      vite: 'vite/bin/vite.js', esbuild: 'esbuild/bin/esbuild' }[args[0]];
    if (!cli) throw new Error(`Unsupported build CLI: ${args[0]}`);
    const resolve = createRequire(join(cwd, 'package.json'));
    const slash = cli.indexOf('/');
    const entry = join(dirname(resolve.resolve(`${cli.slice(0, slash)}/package.json`)), cli.slice(slash + 1));
    args = [entry, ...args.slice(1)];
    cmd = process.execPath;
  }
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: false,
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
  const copied = new Map();
  const sharedRequire = createRequire(join(workspaceRoot, 'app/shared/package.json'));
  function copyDependency(name, from, optional = false) {
    let manifest;
    try { manifest = from.resolve(`${name}/package.json`); }
    catch (error) {
      const candidate = (from.resolve.paths(name) || []).map(directory => join(directory, name, 'package.json')).find(existsSync);
      if (!candidate) { if (optional) return; throw error; }
      manifest = realpathSync(candidate);
    }
    const info = JSON.parse(readFileSync(manifest, 'utf8'));
    if (copied.has(name)) {
      if (copied.get(name) !== info.version) throw new Error(`Native dependency version conflict: ${name}`);
      return;
    }
    copied.set(name, info.version);
    cpSync(dirname(manifest), join(destModules, name), { recursive: true, dereference: true });
    const nested = createRequire(manifest);
    for (const dependency of Object.keys(info.dependencies || {})) copyDependency(dependency, nested);
    for (const dependency of Object.keys(info.optionalDependencies || {})) copyDependency(dependency, nested, true);
  }
  copyDependency('@prisma/client', sharedRequire);
  const clientRequire = createRequire(sharedRequire.resolve('@prisma/client/package.json'));
  const generated = clientRequire.resolve('.prisma/client/package.json');
  cpSync(dirname(generated), join(destModules, '.prisma/client'), { recursive: true, dereference: true });
  copyDependency('sharp', sharedRequire);
  copyDependency('quickjs-emscripten', sharedRequire);
  const apiRequire = createRequire(join(workspaceRoot, 'app/api/package.json'));
  copyDependency('@ffmpeg-installer/ffmpeg', apiRequire);
  copyDependency('ffprobe-static', apiRequire);
  sanitizeBundledNodeModules(destModules);
}

console.log('→ typecheck');
run('npx', ['tsc', '--noEmit']);

console.log('→ prisma generate');
run('npx', ['prisma', 'generate', '--schema', join(workspaceRoot, 'db/prisma/schema.prisma')]);

console.log('→ vite build');
run('npx', ['vite', 'build'], { cwd: join(workspaceRoot, 'app/web') });

rmSync(apiDir, { recursive: true, force: true });
mkdirSync(apiDir, { recursive: true });

console.log('→ bundle Hono API server');
run('npx', [
  'esbuild',
  'app/api/src/index.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--define:import.meta.url=__azhuo_import_meta_url',
  "--banner:js=var __azhuo_import_meta_url = require('node:url').pathToFileURL(__filename).href;",
  '--external:ffprobe-static',
  '--external:@ffmpeg-installer/*',
  '--external:@prisma/client',
  '--external:.prisma/client',
  '--external:@prisma/*',
  '--external:sharp',
  '--external:quickjs-emscripten',
  '--external:@img/*',
  `--alias:@beike/shared=${join(workspaceRoot, 'app/shared/src')}`,
  `--outfile=${join(apiDir, 'index.cjs')}`,
]);
copyNodeDeps(join(apiDir, 'node_modules'));

mkdirSync(join(apiDir, 'prisma'), { recursive: true });
copyFileSync(join(workspaceRoot, 'db', 'prisma', 'schema.prisma'), join(apiDir, 'prisma', 'schema.prisma'));

const templateDb = join(apiDir, 'prisma', 'template.db');
rmSync(templateDb, { force: true });
writeFileSync(templateDb, '');
console.log('→ prisma db push (template sqlite)');
run('npx', ['prisma', 'db', 'push', '--skip-generate', '--schema', join(workspaceRoot, 'db/prisma/schema.prisma')], {
  env: { DATABASE_URL: `file:${templateDb}` },
});

// 分发配置排除私人对象存储账号与本机存储路径。
const prodEnvSource = existsSync(join(workspaceRoot, '.env.production'))
  ? join(workspaceRoot, '.env.production')
  : join(workspaceRoot, '.env');

if (existsSync(prodEnvSource)) {
  const bundledEnv=sanitizeStorageEnv(readFileSync(prodEnvSource,'utf8'));
  writeFileSync(join(apiDir, '.env'),bundledEnv);
  writeFileSync(join(apiDir, 'template.env'),bundledEnv);
  console.log('→ 已生成分发配置：移除私人存储配置，默认使用本地存储');
}

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
