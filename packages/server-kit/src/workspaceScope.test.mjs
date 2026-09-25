import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { migrateDatabase } from './database/migrations.ts';
import { extendPrismaWithWorkspace } from './workspaceScope.ts';
import { runWithWorkspace } from './workspaceContext.ts';

async function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-scope-regression-'));
  const raw = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } } });
  t.after(async () => { await raw.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
  await migrateDatabase(raw);
  return { raw, db: extendPrismaWithWorkspace(raw) };
}
const product = (id) => ({ id, platform: 'jd', itemId: id, title: id });

test('unique reads with select preserve permissions and caller predicates', async t => {
  const { raw, db } = await fixture(t);
  await raw.product.create({ data: { ...product('owned'), workspaceId: 'ws-a' } });
  await runWithWorkspace('ws-a', async () => {
    assert.deepEqual(await db.product.findUnique({ where: { id: 'owned' }, select: { id: true } }), { id: 'owned' });
    assert.equal(await db.product.findUnique({ where: { id: 'owned', AND: [{ title: 'wrong' }] } }), null);
  });
  await runWithWorkspace('ws-b', async () => {
    assert.equal(await db.product.findUnique({ where: { id: 'owned' }, select: { id: true } }), null);
    await assert.rejects(db.product.findUniqueOrThrow({ where: { id: 'owned' } }), { code: 'P2025' });
    await assert.rejects(db.product.update({ where: { id: 'owned' }, data: { title: 'bad' } }), { code: 'P2025' });
    await assert.rejects(db.product.delete({ where: { id: 'owned' } }), { code: 'P2025' });
  });
});

test('nested include, select, counts and pagination exclude other workspaces', async t => {
  const { raw, db } = await fixture(t);
  await raw.sceneAsset.create({ data: { id: 'shared', workspaceId: 'official', title: 'Shared', description: '', lighting: '' } });
  for (const [workspaceId, shotOrder] of [['ws-a', 0], ['ws-b', 1], ['official', 2]]) {
    await raw.actionAsset.create({ data: { workspaceId, title: workspaceId, action: workspaceId, shotType: 'test', sceneId: 'shared', shotOrder } });
  }
  await runWithWorkspace('ws-b', async () => {
    const detail = await db.sceneAsset.findUnique({ where: { id: 'shared' }, include: { actions: true, _count: true } });
    assert.deepEqual(detail.actions.map(a => a.workspaceId).sort(), ['official', 'ws-b']);
    assert.equal(detail._count.actions, 2);
    const rows = await db.sceneAsset.findMany({ select: { actions: { orderBy: { shotOrder: 'asc' }, take: 1, select: { title: true } }, _count: { select: { actions: { where: { title: 'ws-a' } } } } } });
    assert.deepEqual(rows, [{ actions: [{ title: 'ws-b' }], _count: { actions: 0 } }]);
  });
});

test('optional relation reads hide historical foreign references and still include official scenes', async t => {
  const { raw, db } = await fixture(t);
  for (const workspaceId of ['ws-b', 'official']) {
    await raw.sceneAsset.create({ data: { id: workspaceId, workspaceId, title: workspaceId, description: '', lighting: '' } });
    await raw.actionAsset.create({ data: { id: `action-${workspaceId}`, workspaceId: 'ws-a', title: workspaceId, action: '', shotType: '', sceneId: workspaceId } });
  }
  await runWithWorkspace('ws-a', async () => {
    const hidden = await db.actionAsset.findUnique({ where: { id: 'action-ws-b' }, include: { scene: true } });
    assert.equal(hidden.scene, null);
    const shared = await db.actionAsset.findUnique({ where: { id: 'action-official' }, select: { scene: { select: { title: true } } } });
    assert.deepEqual(shared.scene, { title: 'official' });
  });
});

test('upsert creations roll back with their interactive transaction', async t => {
  const { raw, db } = await fixture(t);
  await assert.rejects(runWithWorkspace('ws-a', () => db.$transaction(async tx => {
    await tx.product.upsert({ where: { id: 'rollback' }, create: product('rollback'), update: {} });
    throw new Error('abort transaction');
  })), /abort transaction/);
  assert.equal(await raw.product.count(), 0);
});

test('updates and upserts see records created earlier in the same transaction', async t => {
  const { raw, db } = await fixture(t);
  await runWithWorkspace('ws-a', () => db.$transaction(async tx => {
    await tx.product.create({ data: product('created') });
    await tx.product.update({ where: { id: 'created' }, data: { title: 'updated' } });
    await tx.product.upsert({ where: { id: 'created' }, create: product('created'), update: { title: 'upserted' } });
    await tx.product.delete({ where: { id: 'created' } });
  }));
  assert.equal(await raw.product.count(), 0);
});

test('array transaction rolls back an upsert when a later operation fails', async t => {
  const { raw, db } = await fixture(t);
  await assert.rejects(runWithWorkspace('ws-a', () => db.$transaction([
    db.product.upsert({ where: { id: 'array' }, create: product('array'), update: {} }),
    db.product.create({ data: product('array') }),
  ])), { code: 'P2002' });
  assert.equal(await raw.product.count(), 0);
});

test('compound upserts keep their unique selector and cannot mutate other workspaces', async t => {
  const { raw, db } = await fixture(t);
  await runWithWorkspace('ws-a', async () => {
    const where = { workspaceId_sourceKey: { workspaceId: 'ws-a', sourceKey: 'album' } };
    const create = { name: 'Album', sourceKey: 'album' };
    const first = await db.promptAlbum.upsert({ where, create, update: {} });
    const second = await db.promptAlbum.upsert({ where, create, update: { name: 'Updated' } });
    assert.equal(second.id, first.id);
    assert.equal(second.name, 'Updated');
  });
  await raw.product.create({ data: { ...product('private'), workspaceId: 'ws-b' } });
  await assert.rejects(runWithWorkspace('ws-a', () => db.product.upsert({
    where: { id: 'private' }, create: product('private'), update: { title: 'bad' },
  })), { code: 'P2002' });
  assert.equal((await raw.product.findUnique({ where: { id: 'private' } })).title, 'private');
});
