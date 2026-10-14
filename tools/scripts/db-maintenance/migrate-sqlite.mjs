#!/usr/bin/env node
/** Apply versioned SQLite migrations with the Go migrator. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqliteFile } from './sqlite-path.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const databaseFile = resolveSqliteFile(process.argv[2]);

function resolveGo() {
  const candidates = [process.env.GO_BIN, 'go', join(homedir(), '.local/go/bin/go')].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'go' || existsSync(candidate)) {
      if (spawnSync(candidate, ['version'], { encoding: 'utf8' }).status === 0) return candidate;
    }
  }
  throw new Error('未找到 Go。可安装到 ~/.local/go，或设置 GO_BIN');
}

const result = spawnSync(resolveGo(), ['run', './src/backend/cmd/api', 'migrate', databaseFile], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GOTOOLCHAIN: 'local' },
});
process.exit(result.status ?? 1);
