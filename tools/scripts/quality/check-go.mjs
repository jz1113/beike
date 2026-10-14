#!/usr/bin/env node
/** Go format, vet, line budget, and race tests. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function resolveGo() {
  const candidates = [
    process.env.GO_BIN,
    'go',
    path.join(os.homedir(), '.local/go/bin/go'),
    ...(process.platform === 'win32'
      ? ['C:\\Program Files\\Go\\bin\\go.exe', 'C:\\Go\\bin\\go.exe', path.join(os.homedir(), 'go/bin/go.exe')]
      : []),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['version'], { encoding: 'utf8' }).status === 0) return candidate;
  }
  throw new Error('未找到 Go。可安装到 ~/.local/go，或设置 GO_BIN');
}

function run(go, args) {
  const result = spawnSync(go, args, { cwd: root, encoding: 'utf8', env: { ...process.env, GOTOOLCHAIN: 'local' } });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(result.status || 1);
  }
  return result.stdout;
}

function effectiveLines(file) {
  let count = 0;
  let block = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (block) {
      if (trimmed.includes('*/')) block = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      block = !trimmed.includes('*/');
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    count += 1;
  }
  return count;
}

const violations = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.go') || entry.name.endsWith('_test.go')) continue;
    const lines = effectiveLines(full);
    if (lines > 400) violations.push(`${path.relative(root, full)} ${lines}`);
  }
}
walk(path.join(root, 'src/backend'));
if (violations.length) {
  console.error('Go 文件超过 400 行有效代码:\n' + violations.join('\n'));
  process.exit(1);
}

const go = resolveGo();
const gofmt = path.join(path.dirname(go), 'gofmt');
const dirty = run(gofmt, ['-l', 'src/backend']).trim();
if (dirty) {
  console.error('Go 文件未格式化:\n' + dirty);
  process.exit(1);
}
run(go, ['vet', './src/backend/...']);
const testArgs = process.platform === 'win32' && process.env.CGO_ENABLED !== '1'
  ? ['test', './src/backend/...']
  : ['test', '-race', './src/backend/...'];
run(go, testArgs);
console.log('[go] fmt, vet, max-lines and tests OK');
