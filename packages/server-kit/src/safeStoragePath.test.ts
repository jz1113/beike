import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveDeletableStoragePath } from './safeStoragePath';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-boundary-'));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('accepts managed files and rejects traversal and symlinks without touching external files', () => {
  const root = path.join(dir, 'storage');
  fs.mkdirSync(path.join(root, 'azhuo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'azhuo', 'ok.png'), 'ok');
  const outside = path.join(dir, 'outside');
  fs.writeFileSync(outside, 'sentinel');
  fs.symlinkSync(outside, path.join(root, 'azhuo', 'link'));
  expect(resolveDeletableStoragePath(root, '/storage/azhuo/ok.png')).toBe(fs.realpathSync(path.join(root, 'azhuo', 'ok.png')));
  for (const url of ['/storage/azhuo/../../outside', '/storage/azhuo/%2e%2e/outside', '/storage/azhuo/link', '/storage/azhuo/missing']) {
    expect(resolveDeletableStoragePath(root, url)).toBeNull();
  }
  expect(fs.readFileSync(outside, 'utf8')).toBe('sentinel');
});
