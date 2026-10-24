#!/usr/bin/env node
/** Apply versioned SQLite migrations with the Go migrator. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqliteFile } from './sqlite-path.mjs';
import { resolveGo } from '../common/go-toolchain.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const databaseFile = resolveSqliteFile(process.argv[2]);

const result = spawnSync(resolveGo(), ['run', './src/backend/cmd/api', 'migrate', databaseFile], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GOTOOLCHAIN: 'local' },
});
process.exit(result.status ?? 1);
