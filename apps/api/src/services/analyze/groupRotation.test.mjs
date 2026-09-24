import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reservePromptGroup } from './groupRotation.ts';
import { runWithWorkspace } from '../../../../../packages/server-kit/src/workspaceContext.ts';
const group=(id,patch={})=>({id,title:'手机图组',productCategoryIds:'["digital"]',sourceImageIndices:'[1,2,3,4]',shotPromptsJson:JSON.stringify([1,2,3,4].map(shot_no=>({shot_no,prompt:'产品摄影'}))),...patch});
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE PromptAssetUsageEvent (id TEXT, workspaceId TEXT, assetId TEXT, batchId TEXT, eventType TEXT, createdAt TEXT, metadata TEXT)');
 const db={
 $queryRaw:async(parts,...args)=>sql.prepare(parts.join('?')).all(...args),
 $executeRaw:async(parts,...args)=>Number(sql.prepare(parts.join('?')).run(...args).changes),
 $transaction:async fn=>{sql.exec('BEGIN');try{const value=await fn(db);sql.exec('COMMIT');return value;}catch(e){sql.exec('ROLLBACK');throw e;}},
 };return {sql,db};
}
test('concurrent products consume all matching groups before repeating, including lower scoring matches',async()=>{
 const {sql,db}=fixture();try{
 const pool=[group('a'),group('b'),group('c',{productCategoryIds:'[]'})];
 const results=await runWithWorkspace('a',()=>Promise.all(Array.from({length:7},()=>reservePromptGroup(db,pool,'小米手机',{},'batch'))));
 assert.deepEqual(results.map(r=>r.id),['a','b','c','a','b','c','a']);
 // A later request/new batch continues the persisted cycle, regardless of productIndex.
 assert.equal((await runWithWorkspace('a',()=>reservePromptGroup(db,pool,'vivo 手机',{},'new-batch'))).id,'b');
 assert.equal((await runWithWorkspace('other',()=>reservePromptGroup(db,pool,'小米手机',{}))).id,'a');
 }finally{sql.close();}
});
test('new and removed groups adjust the eligible pool; incompatible and incomplete groups are excluded',async()=>{
 const {sql,db}=fixture();try{await runWithWorkspace('a',async()=>{
 await reservePromptGroup(db,[group('a'),group('b')],'手机',{});
 const pool=[group('a'),group('c'),group('wrong',{title:'戒指',productCategoryIds:'["jewelry"]'}),group('broken',{shotPromptsJson:'[]'})];
 assert.equal((await reservePromptGroup(db,pool,'手机',{})).id,'c');
 assert.equal((await reservePromptGroup(db,pool,'手机',{})).id,'a');
 assert.equal(await reservePromptGroup(db,[group('broken',{shotPromptsJson:'[]'})],'手机',{}),null);
 });}finally{sql.close();}
});
