import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStorageRoot, resolveStoredMediaPath, safeResolveWithinRoot } from '../storagePaths';
import { persistBufferToStorage } from '../persistDataUrl';
import { GET } from '../../../api/src/routes/system/local-media';
let temp: string;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-root-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(temp);
  vi.stubEnv('AZHUO_CACHE_DIR', ''); vi.stubEnv('AZHUO_DATA_DIR', '');
  vi.stubEnv('DATABASE_URL', `file:${path.join(temp, 'db.sqlite')}`);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(temp, { recursive: true, force: true }); });
it('uses one root for writes and reads with only a database URL configured', async () => {
  const url = await persistBufferToStorage(Buffer.from('example'), 'image/png', { customConfig: { enabled: false } as never });
  const response = await GET(new Request(`http://localhost${url}`));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('example');
});
it('honors explicit cache/data precedence and relative database paths', () => {
  vi.stubEnv('DATABASE_URL','file:db/test.sqlite');
  expect(resolveStorageRoot()).toBe(path.join(temp,'db/storage'));
  vi.stubEnv('AZHUO_DATA_DIR',path.join(temp,'data'));
  expect(resolveStorageRoot()).toBe(path.join(temp,'data/storage'));
  vi.stubEnv('AZHUO_CACHE_DIR',path.join(temp,'cache'));
  expect(resolveStorageRoot()).toBe(path.join(temp,'cache'));
});
it('reads legacy fallback without moving files and rejects escaping symlinks', () => {
  const old = path.join(temp,'.azhuo_storage/azhuo'); fs.mkdirSync(old,{recursive:true});
  fs.writeFileSync(path.join(old,'old.png'),'old');
  expect(resolveStoredMediaPath('azhuo/old.png')).toBe(fs.realpathSync(path.join(old,'old.png')));
  fs.writeFileSync(path.join(temp,'private'),'private');
  fs.symlinkSync(path.join(temp,'private'),path.join(old,'escape'));
  expect(resolveStoredMediaPath('azhuo/escape')).toBeNull();
  expect(safeResolveWithinRoot(old,'../private')).toBeNull();
  expect(fs.existsSync(path.join(old,'old.png'))).toBe(true);
});
