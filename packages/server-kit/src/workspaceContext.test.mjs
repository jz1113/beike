import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  hashWorkspaceSecret,
  resolveWorkspaceFromRequest,
  LOCAL_WORKSPACE_ID,
} from './workspaceContext.ts';

test('hashes the workspace secret and keeps it out of the id', () => {
  const secret = 'a'.repeat(32);
  const id = hashWorkspaceSecret(secret);
  assert.equal(id, createHash('sha256').update(secret, 'utf8').digest('hex'));
  assert.equal(id.includes(secret), false);
});

test('desktop and local development use the fixed local workspace', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousDesktop = process.env.DESKTOP_SHELL;
  process.env.NODE_ENV = 'development';
  delete process.env.DESKTOP_SHELL;
  const resolved = resolveWorkspaceFromRequest(new Request('http://127.0.0.1/api/catalog/products'));
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.store.workspaceId, LOCAL_WORKSPACE_ID);
  process.env.NODE_ENV = previousEnv;
  if (previousDesktop === undefined) delete process.env.DESKTOP_SHELL;
  else process.env.DESKTOP_SHELL = previousDesktop;
});

test('production web rejects a missing workspace secret', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousDesktop = process.env.DESKTOP_SHELL;
  process.env.NODE_ENV = 'production';
  delete process.env.DESKTOP_SHELL;
  const missing = resolveWorkspaceFromRequest(new Request('http://example/api/catalog/products'));
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 401);
  }
  const secret = 'b'.repeat(32);
  const present = resolveWorkspaceFromRequest(new Request('http://example/api/catalog/products', {
    headers: { 'x-workspace-token': secret },
  }));
  assert.equal(present.ok, true);
  if (present.ok) assert.equal(present.store.workspaceId, hashWorkspaceSecret(secret));
  process.env.NODE_ENV = previousEnv;
  if (previousDesktop === undefined) delete process.env.DESKTOP_SHELL;
  else process.env.DESKTOP_SHELL = previousDesktop;
});
