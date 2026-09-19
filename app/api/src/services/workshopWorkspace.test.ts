import { afterEach, beforeEach, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkspaceRepository, WorkspaceConflict } from './workshopWorkspace';
import { workshopWorkspaceSql } from '@beike/server-kit/database/workshopWorkspace';
import { snapshotFixture } from '@beike/contracts/workshopWorkspace';
let db: PrismaClient; let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'beike-workspace-'));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } } });
  await db.$executeRawUnsafe(workshopWorkspaceSql);
});
afterEach(async () => { await db.$disconnect(); await rm(dir, { recursive: true, force: true }); });
it('persists through a connection restart and isolates modes', async () => {
  await createWorkspaceRepository(db).write('original', 0, snapshotFixture());
  await db.$disconnect();
  const repository = createWorkspaceRepository(db);
  expect(await repository.read('original')).toMatchObject({ revision: 1, snapshot: snapshotFixture() });
  expect(await repository.read('replication')).toMatchObject({ revision: 0, snapshot: null });
});
it('rejects stale creation and updates without losing saved edits', async () => {
  const repo = createWorkspaceRepository(db); const snapshot = snapshotFixture();
  await repo.write('original', 0, snapshot);
  await expect(repo.write('original', 0, snapshot)).rejects.toBeInstanceOf(WorkspaceConflict);
  await repo.write('original', 1, { ...snapshot, batchInputText: 'new' });
  await expect(repo.write('original', 1, snapshot)).rejects.toBeInstanceOf(WorkspaceConflict);
  expect(await repo.read('original')).toMatchObject({ revision: 2, snapshot: { batchInputText: 'new' } });
});
it('fails closed for corrupt stored data and invalid writes', async () => {
  const repo = createWorkspaceRepository(db);
  await db.$executeRaw`INSERT INTO WorkshopWorkspace VALUES ('original', 1, 'broken', 'now')`;
  await expect(repo.read('original')).rejects.toThrow();
  await expect(repo.write('original', 1, { ...snapshotFixture(), version: 2 } as never)).rejects.toThrow();
  expect(await db.$queryRaw`SELECT snapshotJson FROM WorkshopWorkspace`).toEqual([{ snapshotJson: 'broken' }]);
});
