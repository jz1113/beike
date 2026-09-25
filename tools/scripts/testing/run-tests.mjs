#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTests } from './discover-tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const scope = args.find(arg => !arg.startsWith('--')) || 'all';
if (args.some(arg => arg.startsWith('--') && arg !== '--list') || args.filter(arg => !arg.startsWith('--')).length > 1) {
  throw new Error('Usage: run-tests.mjs [all|web|api|domain|tooling] [--list]');
}
const tests = discoverTests(root, scope);
if (!tests.length) throw new Error(`No tests found for ${scope}`);
if (args.includes('--list')) {
  console.log(tests.join('\n'));
} else {
  console.log(`Running ${tests.length} test files (${scope}); isolated fallback DB and local data directory.`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'beike-tests-'));
  try {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], {
      cwd: root, stdio: 'inherit', env: {
        ...process.env, NODE_ENV: 'test', TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json'),
        DATABASE_URL: `file:${path.join(scratch, 'fallback.db')}`, AZHUO_DATA_DIR: scratch,
      },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
