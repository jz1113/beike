import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { boundaryViolations } from './boundary-rules.mjs';
import { moduleReferences } from './source-files.mjs';

test('import inventory includes exports, require, type imports and lazy imports', () => {
  const source = ts.createSourceFile('fixture.ts', `
    import x from './static'; export { y } from './export'; export * from './star';
    const z = import('./lazy'); const q = require('node:fs');
    type T = import('./types').T; const untouched = './not-an-import';
  `, ts.ScriptTarget.Latest, true);
  assert.deepEqual(moduleReferences(source), ['./static', './export', './star', './lazy', 'node:fs', './types']);
});
test('browser and shared layers cannot bypass boundaries via aliases or Node builtins', () => {
  assert.ok(boundaryViolations('apps/web/src/shared/a.ts', 'apps/web/src/features/assets/a.ts', '@/features/assets/a').includes('shared-no-features'));
  for (const source of ['apps/web/src/a.ts', 'packages/domain/src/a.ts', 'packages/contracts/src/a.ts']) {
    for (const specifier of ['node:fs/promises', 'fs', '@prisma/client', '@beike/server-kit/storage', 'sharp']) {
      assert.ok(boundaryViolations(source, '', specifier).includes('browser-safe'), `${source}: ${specifier}`);
    }
  }
  assert.deepEqual(boundaryViolations('apps/web/src/a.ts', 'packages/domain/src/a.ts', '@beike/domain/a'), []);
});
test('thin contracts, repositories and workshop model have enforceable direction', () => {
  assert.ok(boundaryViolations('packages/contracts/src/a.ts', 'packages/domain/src/a.ts', '@beike/domain/a').includes('contracts-stay-thin'));
  assert.ok(boundaryViolations('apps/api/src/services/a.ts', 'apps/api/src/repositories/db.ts', '../repositories/db').includes('prisma-through-repositories'));
  assert.deepEqual(boundaryViolations('apps/api/src/services/a.ts', 'apps/api/src/repositories/access.ts', '../repositories/access'), []);
  assert.ok(boundaryViolations('apps/web/src/features/workshop/model/workspace/a.ts', 'apps/web/src/features/workshop/hooks/a.ts', '../../hooks/a').includes('workshop-model-no-ui'));
});
test('feature exceptions stay explicit rather than allowing any feature import', () => {
  const from = 'apps/web/src/features/workshop/a.ts', to = 'apps/web/src/features/assets/b.ts';
  assert.equal(boundaryViolations(from, to, './b').length, 1);
  assert.deepEqual(boundaryViolations(from, to, './b', new Set(['workshop->assets'])), []);
});
