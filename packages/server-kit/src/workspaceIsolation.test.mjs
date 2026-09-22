import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('two workspaces cannot read each other rows, files, or mutate official catalog', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-ws-'));
  const storage = path.join(dir, 'storage');
  mkdirSync(storage, { recursive: true });
  process.env.AZHUO_CACHE_DIR = storage;
  process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;

  const { PrismaClient } = await import('@prisma/client');
  const { migrateDatabase } = await import('./database/migrations.ts');
  const { extendPrismaWithWorkspace } = await import('./workspaceScope.ts');
  const { OFFICIAL_WORKSPACE_ID, runWithWorkspace, WorkspaceRequiredError } = await import('./workspaceContext.ts');
  const { persistBufferToStorage } = await import('./persistDataUrl.ts');
  const { isWorkspaceStorageRel } = await import('./storagePaths.ts');

  const url = `file:${path.join(dir, 'test.db')}`;
  const unscoped = new PrismaClient({ datasources: { db: { url } } });
  await migrateDatabase(unscoped);
  await unscoped.styleRecipe.create({
    data: {
      id: 'official-recipe',
      workspaceId: OFFICIAL_WORKSPACE_ID,
      name: '官方配方',
      promptSnippet: '官方骨架',
    },
  });
  const db = extendPrismaWithWorkspace(new PrismaClient({ datasources: { db: { url } } }));

  const productA = await runWithWorkspace('ws-a', async () => db.product.create({
    data: { platform: 'jd', itemId: 'same', title: '用户A' },
  }));
  const productB = await runWithWorkspace('ws-b', async () => db.product.create({
    data: { platform: 'jd', itemId: 'same', title: '用户B' },
  }));

  const listA = await runWithWorkspace('ws-a', async () => db.product.findMany());
  assert.equal(listA.length, 1);
  assert.equal(listA[0].id, productA.id);
  assert.equal(await runWithWorkspace('ws-a', async () => db.product.findUnique({ where: { id: productB.id } })), null);

  await assert.rejects(
    async () => db.product.findMany(),
    (error) => error instanceof WorkspaceRequiredError,
  );

  const recipes = await runWithWorkspace('ws-a', async () => db.styleRecipe.findMany());
  assert.equal(recipes.some((row) => row.id === 'official-recipe'), true);
  await assert.rejects(
    () => runWithWorkspace('ws-a', async () => db.styleRecipe.update({
      where: { id: 'official-recipe' },
      data: { name: '篡改' },
    })),
  );
  const official = await unscoped.styleRecipe.findUnique({ where: { id: 'official-recipe' } });
  assert.equal(official?.name, '官方配方');

  const urlA = await runWithWorkspace('ws-a', async () => persistBufferToStorage(Buffer.from('aaa'), 'image/png'));
  const urlB = await runWithWorkspace('ws-b', async () => persistBufferToStorage(Buffer.from('bbb'), 'image/png'));
  const relA = String(urlA).replace(/^\/storage\//, '');
  const relB = String(urlB).replace(/^\/storage\//, '');
  assert.equal(relA.startsWith('ws-a/'), true);
  assert.equal(isWorkspaceStorageRel(relA, 'ws-a'), true);
  assert.equal(isWorkspaceStorageRel(relB, 'ws-a'), false);

  await unscoped.$disconnect();
  await db.$disconnect();
});
