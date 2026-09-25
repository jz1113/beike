import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceManifestErrors } from './workspace-rules.mjs';

test('workspace dependencies must be private, local and follow runtime boundaries', () => {
  const manifest = { name: '@beike/web', private: true, dependencies: { '@beike/domain': 'workspace:*', react: '19.2.8' } };
  assert.deepEqual(workspaceManifestErrors('apps/web', manifest), []);
  assert.ok(workspaceManifestErrors('apps/web', { ...manifest, private: false }).length);
  assert.ok(workspaceManifestErrors('apps/web', { ...manifest, dependencies: { '@beike/domain': '*' } }).some(error => error.includes('workspace:*')));
  assert.ok(workspaceManifestErrors('apps/web', { ...manifest, dependencies: { '@beike/server-kit': 'workspace:*' } }).some(error => error.includes('Forbidden')));
  assert.ok(workspaceManifestErrors('packages/domain', { name: '@beike/domain', private: true, dependencies: { '@beike/contracts': 'workspace:*' } }).length);
});
