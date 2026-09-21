#!/usr/bin/env node
/** Copy the configured SQLite database to a timestamped backup file. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch { /* missing .env is fine */ }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaDir = path.join(root, 'packages/prisma');

function resolveSqliteFile() {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  if (!url.startsWith('file:')) {
    throw new Error(`db:backup 仅支持 SQLite file: URL，当前为 ${url}`);
  }
  const raw = url.slice('file:'.length);
  return path.isAbsolute(raw) ? raw : path.resolve(schemaDir, raw);
}

const source = resolveSqliteFile();
if (!fs.existsSync(source)) {
  console.error(`数据库文件不存在: ${source}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(schemaDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const target = path.join(backupDir, `azhuo-${stamp}.db`);
fs.copyFileSync(source, target);
for (const suffix of ['-wal', '-shm']) {
  const sidecar = `${source}${suffix}`;
  if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${target}${suffix}`);
}
console.log(`SQLite backup written to ${target}`);
