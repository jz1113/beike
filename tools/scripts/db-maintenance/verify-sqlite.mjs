#!/usr/bin/env node
/** Verify SQLite integrity of DATABASE_URL or a backup path passed as argv[2]. */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolveSqliteFile } from './sqlite-path.mjs';

const dbFile = resolveSqliteFile(process.argv[2]);
if (!fs.existsSync(dbFile)) {
  console.error(`数据库文件不存在: ${dbFile}`);
  process.exit(1);
}

const python = spawnSync(process.env.SQLITE_BACKUP_PYTHON || 'python3', ['-c', `
import pathlib, sqlite3, sys
file = pathlib.Path(sys.argv[1])
# A WAL file must be included for a live database. A standalone snapshot can be
# inspected immutably without creating sidecar files next to the backup.
mode = '?mode=ro' if pathlib.Path(str(file) + '-wal').exists() else '?immutable=1'
con = sqlite3.connect(file.as_uri() + mode, uri=True)
print(con.execute('PRAGMA integrity_check').fetchone()[0])
print('foreign_key_violations=' + str(len(con.execute('PRAGMA foreign_key_check').fetchall())))
`, dbFile], { encoding: 'utf8' });

if (python.error || python.status !== 0) {
  console.error(python.stderr || python.error?.message || '无法运行 python3 做完整性检查');
  process.exit(1);
}

const result = python.stdout.trim();
if (result !== 'ok\nforeign_key_violations=0') {
  console.error(`SQLite verification failed: ${result}`);
  process.exit(1);
}
console.log(`SQLite integrity_check ok: ${dbFile}`);
