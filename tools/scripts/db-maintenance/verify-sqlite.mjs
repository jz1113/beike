#!/usr/bin/env node
/** Verify SQLite integrity of DATABASE_URL or a backup path passed as argv[2]. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch { /* missing .env is fine */ }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaDir = path.join(root, 'packages/prisma');

function resolveSqliteFile() {
  const fromArg = process.argv[2];
  if (fromArg) return path.resolve(fromArg);
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  if (!url.startsWith('file:')) {
    throw new Error(`db:restore:verify 仅支持 SQLite file: URL，当前为 ${url}`);
  }
  const raw = url.slice('file:'.length);
  return path.isAbsolute(raw) ? raw : path.resolve(schemaDir, raw);
}

const dbFile = resolveSqliteFile();
if (!fs.existsSync(dbFile)) {
  console.error(`数据库文件不存在: ${dbFile}`);
  process.exit(1);
}

const python = spawnSync('python3', ['-c', `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
print(con.execute('PRAGMA integrity_check').fetchone()[0])
`, dbFile], { encoding: 'utf8' });

if (python.error || python.status !== 0) {
  console.error(python.stderr || python.error?.message || '无法运行 python3 做完整性检查');
  process.exit(1);
}

const result = python.stdout.trim();
if (result !== 'ok') {
  console.error(`SQLite integrity_check failed: ${result}`);
  process.exit(1);
}
console.log(`SQLite integrity_check ok: ${dbFile}`);
