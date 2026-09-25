import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverTests } from './discover-tests.mjs';

test('discovers nested colocated tests without traversing dependencies, backups or symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beike-discovery-'));
  try {
    for (const file of ['apps/web/src/features/x/model/deep/a.test.mjs', 'apps/api/src/a.test.ts',
      'packages/domain/src/x.spec.mjs', 'tools/scripts/quality/a.test.mjs',
      'apps/web/src/node_modules/ignored.test.mjs', 'packages/prisma/backups/ignored.test.mjs',
      'apps/web/src/dist/ignored.test.mjs', 'tools/scripts/qa/workshop-browser.mjs']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), '');
    }
    fs.symlinkSync(path.join(root, 'apps/api/src'), path.join(root, 'apps/web/src/link'), 'dir');
    assert.deepEqual(discoverTests(root), ['apps/api/src/a.test.ts', 'apps/web/src/features/x/model/deep/a.test.mjs',
      'packages/domain/src/x.spec.mjs', 'tools/scripts/quality/a.test.mjs']);
    assert.deepEqual(discoverTests(root, 'web'), ['apps/web/src/features/x/model/deep/a.test.mjs']);
    assert.throws(() => discoverTests(root, '../'), /Unknown test scope/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
