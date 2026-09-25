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

test('reserved mother groups carry distinct scene bindings through final storyboard assembly', async () => {
  const { assembleStoryboardSlots, parseGroupShotSkeleton, buildBoundGroupGridPrompt } = await import('@beike/domain/workshopPipeline');
  const { assembleStoryboardShots } = await import('./promptAssembler.ts');
  const { sql, db } = fixture();
  try {
    const pool = ['木桌母组', '暗棚母组', '窗边母组'].map((title, index) => group(`group-${index}`, {
      title, shotPromptsJson: JSON.stringify([1,2,3,4].map(shot_no => ({
        shot_no, title: `${title}镜${shot_no}`, has_human: false,
        prompt: `【场景结构】${title}空间${shot_no}\n【光影】${title}光线${shot_no}\n【动作或摆放】商品平放`,
      }))),
    }));
    const results = await runWithWorkspace('integration', () => Promise.all(Array.from({ length: 5 }, async (_, productIndex) => {
      const selected = await reservePromptGroup(db, pool, '小米手机', {}, 'batch');
      const assets = { scenes: [{ title: '图组原场景', description: `${selected.title}全局摘要` }] };
      const filledSlots = assembleStoryboardSlots({ assets, lockedGroupShots: parseGroupShotSkeleton(selected.shotPromptsJson) });
      const assembled = await assembleStoryboardShots({
        rawOutput: JSON.stringify({ prompts: [1,2,3,4].map(shot_no => ({ shot_no, product_sentence: '@图片1 商品平放并形成接触阴影' })) }),
        shotCount: 4, productTitle: '小米手机', isNoModel: true, hasAnchorFace: false, productIndex,
        assetLibraryData: assets, actualModelUsed: 'fixture', triedModels: [], visionUsage: null, filledSlots,
      });
      const grid = buildBoundGroupGridPrompt(assembled.prompts);
      assembled.prompts.forEach((shot, index) => {
        assert.equal(shot.scene, `${selected.title}空间${index+1}`);
        assert.equal(shot.applied_scene, `母本场景 · ${shot.scene}`);
        assert.ok(grid.includes(shot.prompt));
      });
      assert.doesNotMatch(grid, /全局摘要|S-01|图组原场景/);
      for (const other of pool.filter(candidate => candidate.id !== selected.id)) assert.ok(!grid.includes(other.title));
      return selected.id;
    })));
    assert.deepEqual(results, ['group-0', 'group-1', 'group-2', 'group-0', 'group-1']);
  } finally { sql.close(); }
});

test('a failed reservation does not poison the queue for the next request', async () => {
  const { sql, db } = fixture();
  try {
    let failed = false;
    const broken = { ...db, $transaction: async fn => {
      if (!failed) { failed = true; throw new Error('fixture database unavailable'); }
      return db.$transaction(fn);
    } };
    await runWithWorkspace('failure', async () => {
      await assert.rejects(reservePromptGroup(broken, [group('a'), group('b')], '手机', {}), /unavailable/);
      assert.equal((await reservePromptGroup(broken, [group('a'), group('b')], '手机', {})).id, 'a');
      assert.equal((await reservePromptGroup(broken, [group('a'), group('b')], '手机', {})).id, 'b');
    });
  } finally { sql.close(); }
});
