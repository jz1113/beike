#!/usr/bin/env node
/** Create and verify a consistent SQLite snapshot, including committed WAL data. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveSqliteFile } from './sqlite-path.mjs';
import { createSqliteSnapshot } from './sqlite-snapshot.mjs';

const source = resolveSqliteFile(process.argv[2]);
if (!fs.existsSync(source)) throw new Error(`数据库文件不存在: ${source}`);

const backupDir = path.join(path.dirname(source), 'database-backups');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `azhuo-${stamp}-${randomUUID()}.db`);
createSqliteSnapshot(source, target);
console.log(`SQLite consistent backup written to ${target}`);
