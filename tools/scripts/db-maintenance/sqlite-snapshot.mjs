/** Copy committed SQLite data through the backup API, including live WAL pages. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function createSqliteSnapshot(source, target) {
  if (!fs.statSync(source).isFile()) throw new Error(`数据库文件不存在: ${source}`);
  // Reserve a private destination without overwriting any existing backup.
  fs.closeSync(fs.openSync(target, 'wx', 0o600));
  try {
    const result = spawnSync(process.env.SQLITE_BACKUP_PYTHON || 'python3', ['-c', `
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
`, path.resolve(source), path.resolve(target)], { encoding: 'utf8', timeout: 120000 });
    if (result.error || result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.error?.message || `备份失败 (exit ${result.status})`);
    }
    return target;
  } catch (error) {
    fs.unlinkSync(target);
    throw error;
  }
}
