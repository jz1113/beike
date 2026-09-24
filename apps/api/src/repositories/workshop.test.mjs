import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopBatchConflict, WorkshopBatchNotFound } from '../services/workshopBatches.ts';

describe('workshop batch repository errors', () => {
  it('exposes conflict and not-found as typed errors', () => {
    assert.equal(new WorkshopBatchNotFound().name, 'Error');
    assert.ok(new WorkshopBatchConflict() instanceof Error);
    assert.ok(new WorkshopBatchNotFound() instanceof Error);
  });
});

import { DatabaseSync } from 'node:sqlite';
import { createWorkshopBatchRepository } from '../services/workshopBatches.ts';
import { runWithWorkspace } from '../../../../packages/server-kit/src/workspaceContext.ts';

function deletionFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE WorkshopBatchState (workspaceId TEXT, activeBatchId TEXT, legacyMigratedAt TEXT);
    CREATE TABLE WorkshopBatch (workspaceId TEXT, id TEXT);
    CREATE TABLE WorkshopOutputReview (workspaceId TEXT, batchId TEXT);
    CREATE TABLE WorkshopPipelineRun (workspaceId TEXT, batchId TEXT);
    CREATE TABLE PromptAssetUsageEvent (workspaceId TEXT, batchId TEXT);`);
  sqlite.exec("INSERT INTO WorkshopBatchState VALUES ('a','current',NULL),('b','current',NULL)");
  for (const workspace of ['a','b']) for (const id of ['current','old','keep']) {
    sqlite.prepare('INSERT INTO WorkshopBatch VALUES (?,?)').run(workspace,id);
    for (const table of ['WorkshopOutputReview','WorkshopPipelineRun','PromptAssetUsageEvent']) {
      sqlite.prepare(`INSERT INTO ${table} VALUES (?,?)`).run(workspace,id);
    }
  }
  const db = {
    $queryRaw: async (parts,...values)=>sqlite.prepare(parts.join('?')).all(...values),
    $executeRaw: async (parts,...values)=>Number(sqlite.prepare(parts.join('?')).run(...values).changes),
    $transaction: async fn=>{ sqlite.exec('BEGIN');try {const result=await fn(db);sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;} },
  };
  return {sqlite,repository:createWorkshopBatchRepository(db)};
}

describe('delete one workshop history record',()=>{
  it('deletes only the named record and its related data in the current workspace',async()=>{
    const {sqlite,repository}=deletionFixture();
    try {
      assert.deepEqual(await runWithWorkspace('a',()=>repository.deleteHistory('old')),{deleted:1});
      for (const [table,column] of [['WorkshopBatch','id'],['WorkshopOutputReview','batchId'],['WorkshopPipelineRun','batchId'],['PromptAssetUsageEvent','batchId']]) {
        assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,5);
        assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE workspaceId='b' AND ${column}='old'`).get().count,1);
      }
    } finally {sqlite.close();}
  });
  it('refuses deletion of the active batch or a record outside this workspace',async()=>{
    const {sqlite,repository}=deletionFixture();
    try {
      await assert.rejects(runWithWorkspace('a',()=>repository.deleteHistory('current')),WorkshopBatchConflict);
      await assert.rejects(runWithWorkspace('other',()=>repository.deleteHistory('old')),WorkshopBatchNotFound);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM WorkshopBatch').get().count,6);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM WorkshopOutputReview').get().count,6);
    } finally {sqlite.close();}
  });
  it('rolls back related records when deletion fails',async()=>{
    const {sqlite,repository}=deletionFixture();
    try {
      sqlite.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON WorkshopBatch BEGIN SELECT RAISE(ABORT,'test failure'); END");
      await assert.rejects(runWithWorkspace('a',()=>repository.deleteHistory('old')),/test failure/);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM WorkshopOutputReview').get().count,6);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM WorkshopPipelineRun').get().count,6);
    } finally {sqlite.close();}
  });
});
