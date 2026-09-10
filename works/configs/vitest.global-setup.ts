import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Tests never inherit a developer's DATABASE_URL or desktop storage directory. */
export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'azhuo-test-'));
  writeFileSync(join(dir, 'test.db'), '');
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.AZHUO_DATA_DIR = dir;
  process.env.AZHUO_CACHE_DIR = join(dir, 'storage');
  process.env.NODE_ENV = 'test';
  const repoRoot = resolve(__dirname, '../..');
  try {
    execFileSync(process.execPath, [resolve(repoRoot, 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve(repoRoot, 'db/prisma/schema.prisma')], {
      env: process.env, stdio: 'pipe',
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(dir, { recursive: true, force: true });
}
