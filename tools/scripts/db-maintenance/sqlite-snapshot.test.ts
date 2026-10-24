import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteSnapshot } from './sqlite-snapshot.mjs';

let directory: string;
const python = process.env.SQLITE_BACKUP_PYTHON || 'python3';
const sqliteAvailable = spawnSync(python, ['-c', 'import sqlite3']).status === 0;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'beike-snapshot-'));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!sqliteAvailable)('consistent SQLite snapshots (requires Python sqlite3)', () => {
  it('captures committed WAL data while the source remains open', async () => {
    const source = path.join(directory, '源 数据.db');
    const target = path.join(directory, 'snapshot.db');
    const writer = spawn(python, ['-u', '-c', `
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('PRAGMA journal_mode=WAL')
db.execute('PRAGMA wal_autocheckpoint=0')
db.execute('CREATE TABLE sentinel (value TEXT)')
db.execute("INSERT INTO sentinel VALUES ('committed in WAL')")
db.commit()
print('ready', flush=True)
sys.stdin.readline()
db.close()
`, source], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((resolve, reject) => {
        writer.stdout.once('data', () => resolve());
        writer.once('error', reject);
        writer.once('exit', (code) => reject(new Error(`writer exited: ${code}`)));
      });
      expect(fs.statSync(`${source}-wal`).size).toBeGreaterThan(0);
      const original = fs.readFileSync(source);
      const wal = fs.readFileSync(`${source}-wal`);
      createSqliteSnapshot(source, target);
      const result = spawnSync(python, ['-c', `
import pathlib, sqlite3, sys
with sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri() + '?immutable=1', uri=True) as db:
    print(db.execute('SELECT value FROM sentinel').fetchone()[0])
`, target], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('committed in WAL');
      expect(fs.readFileSync(source)).toEqual(original);
      expect(fs.readFileSync(`${source}-wal`)).toEqual(wal);
      if (process.platform !== 'win32') expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    } finally {
      if (writer.pid && writer.exitCode === null && writer.signalCode === null) {
        const exited = once(writer, 'close');
        writer.stdin.end('\n');
        await exited;
      }
    }
  });

  it('never overwrites an existing backup', () => {
    const source = path.join(directory, 'source.db');
    const target = path.join(directory, 'keep.db');
    fs.writeFileSync(source, 'not needed for collision check');
    fs.writeFileSync(target, 'keep existing backup');
    expect(() => createSqliteSnapshot(source, target)).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('keep existing backup');
  });

  it('removes an incomplete destination when the source is invalid', () => {
    const source = path.join(directory, 'invalid.db');
    const target = path.join(directory, 'incomplete.db');
    fs.writeFileSync(source, 'not a SQLite database');
    expect(() => createSqliteSnapshot(source, target)).toThrow();
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(source, 'utf8')).toBe('not a SQLite database');
  });
});
