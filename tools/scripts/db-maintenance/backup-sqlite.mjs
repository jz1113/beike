#!/usr/bin/env node
/** Create and verify a consistent SQLite snapshot, including committed WAL data. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolveSqliteFile } from './sqlite-path.mjs';

const source = resolveSqliteFile(process.argv[2]);
if (!fs.existsSync(source)) throw new Error(`数据库文件不存在: ${source}`);

const backupDir = path.join(path.dirname(source), 'database-backups');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `azhuo-${stamp}-${randomUUID()}.db`);
const python = process.env.SQLITE_BACKUP_PYTHON || 'python3';
const result = spawnSync(python, ['-c', `
import os, pathlib, sqlite3, sys
source, target = sys.argv[1:3]
src = sqlite3.connect(pathlib.Path(source).as_uri() + '?mode=ro', uri=True, timeout=30)
dst = sqlite3.connect(target, timeout=30)
try:
    src.backup(dst)
    dst.commit()
finally:
    dst.close()
    src.close()
check = sqlite3.connect(pathlib.Path(target).as_uri() + '?immutable=1', uri=True)
try:
    if check.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('backup integrity_check failed')
    if check.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError('backup foreign_key_check failed')
finally:
    check.close()
fd = os.open(target, os.O_RDONLY)
try:
    os.fsync(fd)
finally:
    os.close(fd)
`, source, target], { encoding: 'utf8' });

if (result.error || result.status !== 0) {
  try { fs.unlinkSync(target); } catch { /* preserve original error */ }
  throw new Error(result.stderr?.trim() || result.error?.message || `备份失败 (exit ${result.status})`);
}
fs.chmodSync(target, 0o600);
console.log(`SQLite consistent backup written to ${target}`);
