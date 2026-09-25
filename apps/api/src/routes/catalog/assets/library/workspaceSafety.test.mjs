import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('library relations and reset preserve workspace boundaries', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-library-safety-'));
  const database = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.AZHUO_DATA_DIR = dir;
  const { initializeDatabase, prisma, unscopedPrisma: raw } = await import('@beike/server-kit/prisma');
  const { runWithWorkspace } = await import('@beike/server-kit/workspaceContext');
  const { executeLibraryPost, executeLibraryPut } = await import('./libraryMutations.ts');
  const { executeLibraryGet } = await import('../../../../services/library/queries.ts');
  const { clearLocalDatabase } = await import('./libraryMaintenance.ts');
  t.after(async () => { await prisma.$disconnect(); await raw.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
  await initializeDatabase();
  for (const workspaceId of ['ws-a', 'ws-b', 'official']) {
    await raw.sceneAsset.create({ data: { id: `${workspaceId}-scene`, workspaceId, title: workspaceId, description: '', lighting: '' } });
  }
  const request = (method, body) => new Request('https://example.test/api/catalog/assets/library', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let actionId;
  await t.test('cannot create or edit an action linked to another private scene', async () => {
    await runWithWorkspace('ws-a', async () => {
      const forbidden = await executeLibraryPost(request('POST', { assetType: 'action', data: { sceneId: 'ws-b-scene' } }));
      assert.equal(forbidden.status, 400);
      assert.equal(await prisma.actionAsset.count(), 0);
      const created = await executeLibraryPost(request('POST', { assetType: 'action', data: { sceneId: 'official-scene', action: 'private action' } }));
      assert.equal(created.status, 200);
      actionId = (await created.json()).item.id;
      const edited = await executeLibraryPut(request('PUT', { assetType: 'action', id: actionId, data: { sceneId: 'ws-b-scene' } }));
      assert.equal(edited.status, 400);
      assert.equal((await prisma.actionAsset.findUnique({ where: { id: actionId } })).sceneId, 'official-scene');
    });
  });
  await t.test('scene detail and list never return another workspace action', async () => {
    await runWithWorkspace('ws-b', async () => {
      for (const query of ['type=scene&id=official-scene', 'type=scene', 'type=all']) {
        const response = await executeLibraryGet(new Request(`https://example.test/api/catalog/assets/library?${query}`));
        assert.equal(response.status, 200);
        assert.equal((await response.text()).includes('private action'), false);
      }
    });
  });
  await t.test('reset terminates, clears nested own categories and keeps official and other workspace data', async () => {
    await raw.assetProductCategory.create({ data: { id: 'official-cat', name: 'Official', workspaceId: 'official' } });
    await raw.assetProductCategory.create({ data: { id: 'b-cat', name: 'Other', workspaceId: 'ws-b' } });
    await runWithWorkspace('ws-a', async () => {
      await prisma.assetProductCategory.create({ data: { id: 'a-parent', name: 'Parent' } });
      await prisma.assetProductCategory.create({ data: { name: 'Child', parentId: 'a-parent' } });
      const response = await clearLocalDatabase();
      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);
    });
    assert.equal(await raw.assetProductCategory.count({ where: { workspaceId: 'ws-a' } }), 0);
    assert.equal(await raw.sceneAsset.count({ where: { workspaceId: 'ws-a' } }), 0);
    assert.equal(await raw.actionAsset.count({ where: { id: actionId } }), 0);
    assert.equal(await raw.assetProductCategory.count({ where: { workspaceId: { in: ['ws-b', 'official'] } } }), 2);
    assert.equal(await raw.sceneAsset.count(), 2);
    assert.equal(existsSync(`${database}.catalog-reset`), false);
  });
});
