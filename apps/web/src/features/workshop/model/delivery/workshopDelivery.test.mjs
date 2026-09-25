import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
async function loadBrowserModule(relativePath, plugins = []) {
  const result = await build({entryPoints:[fileURLToPath(new URL(relativePath,import.meta.url))],
    bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env':'{}'},plugins});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { buildMatrixExportRows } = await loadBrowserModule('./batchMatrixExport.ts');
const { generateAllCopywriting, generateCopywritingForProduct } = await loadBrowserModule('./batchCopywriting.ts');
const { canNativeOfflineExport } = await loadBrowserModule('./batchZipNative.ts');

const task = (shot_no, patch = {}) => ({ id:`t${shot_no}`,shot_no,status:'SUCCESS',resultUrl:`/storage/${shot_no}.png`,...patch });
const product = (id = 'p', patch = {}) => ({ id,itemId:id,title:'手机',selected:true,selectedProductImages:['chosen.jpg'],tasks:[task(1)],prompts:[],...patch });
const response = (data) => new Response(JSON.stringify(data), { headers:{'Content-Type':'application/json'} });
const copyResponse = () => response({success:true,data:{title:'生成标题',content:'生成正文',tags:[]}});
function context(initial, extra = {}) {
  let items = initial;
  return { getItems:()=>items, setItems:update=>{ items = typeof update === 'function' ? update(items) : update; },
    selectedVisionModel:'gpt-5.4-mini', showToast:()=>{}, ...extra };
}

test('offline export resolves original shot numbers and leaves failed downloads blank', async () => {
  const item = product('p',{tasks:[task(1,{status:'FAILURE'}),task(2),task(4),task(3,{resultStatus:'superseded'}),task(5,{resultUrl:'blob:expired'})]});
  const lookedUp = [];
  const [row] = await buildMatrixExportRows([item],undefined,{offline:true,linkForShot:(_,shotNo)=>{
    lookedUp.push(shotNo); return shotNo === 2 ? 'p/分镜2.png' : undefined;
  }});
  assert.deepEqual(lookedUp,[2,4]);
  assert.equal(row['图链接1'],'p/分镜2.png');
  assert.equal(row['图链接2'],'');
  assert.equal(row['图链接3'],'');
});

test('native ZIP eligibility ignores superseded and expired results', () => {
  assert.equal(canNativeOfflineExport([product('p',{tasks:[task(1,{resultStatus:'superseded'})]})]),false);
  assert.equal(canNativeOfflineExport([product('p',{tasks:[task(1),task(2,{resultUrl:'blob:expired'})]})]),true);
});

test('batch copy handles incomplete titles and excludes unselected or obsolete results', async t => {
  const bodies = [];
  t.mock.method(globalThis,'fetch',async (_url,init)=>{ bodies.push(JSON.parse(init.body));return copyResponse(); });
  const ctx = context([product('missing-title',{copywriting:{title:' ',content:'正文'}}),
    product('unselected',{selected:false}),product('obsolete',{tasks:[task(1,{resultStatus:'superseded'})]}),
    product('complete',{copywriting:{title:'标题',content:'正文'}})]);
  await generateAllCopywriting(ctx);
  assert.equal(bodies.length,1);
  assert.deepEqual(bodies[0].imageUrls,['/storage/1.png']);
  assert.equal(ctx.getItems()[0].copywriting.title,'生成标题');
});

test('forced rewrite preserves edits made while the response is in flight and deduplicates clicks', async t => {
  let resolveResponse;
  let calls = 0;
  t.mock.method(globalThis,'fetch',()=>{ calls++; return new Promise(resolve=>{resolveResponse=resolve;}); });
  const item = product('edit',{copywriting:{title:'原文',content:'原正文'}});
  const ctx = context([item],{force:true});
  const first = generateCopywritingForProduct(item,ctx);
  const duplicate = generateCopywritingForProduct(item,ctx);
  await Promise.resolve();
  ctx.setItems(items=>items.map(entry=>({...entry,copywriting:{title:'手工标题',content:'手工正文'}})));
  resolveResponse(copyResponse());
  await Promise.all([first,duplicate]);
  assert.equal(calls,1);
  assert.equal(ctx.getItems()[0].copywriting.title,'手工标题');
  assert.equal(ctx.getItems()[0].isCopywritingGenerating,false);
});

test('copy request failure preserves the current manual copy',async t=>{
  let resolveResponse;
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{resolveResponse=resolve;}));
  const item=product('failure');const ctx=context([item]);
  const pending=generateCopywritingForProduct(item,ctx);
  await Promise.resolve();
  ctx.setItems(items=>items.map(entry=>({...entry,copywriting:{title:'保留',content:'编辑内容'}})));
  resolveResponse(response({success:false,error:'服务暂不可用'}));
  assert.equal(await pending,false);
  assert.equal(ctx.getItems()[0].copywriting.title,'保留');
  assert.equal(ctx.getItems()[0].copywritingError,'服务暂不可用');
});

test('single-shot retry locks duplicate submissions and ignores results for a replaced task', async t => {
  let finish;
  let submissions = 0;
  const run = async () => { submissions++; return new Promise(resolve=>{finish=resolve;}); };
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected network request');});
  globalThis.__workshopTestExecute = run;
  const { retrySingleShotTaskCoordinator: retry } = await loadBrowserModule('../generation/batchGenerationCoordinator.ts', [{
    name:'mock-image-execution',setup(build) { build.onLoad({filter:/\/batchTaskExecution\.ts$/},()=>({
      contents:'export const executeSingleImageTask = (...args) => globalThis.__workshopTestExecute(...args);',loader:'js'
    })); }
  }]);
  try {
    const item = product('retry',{analyzedSuccess:true,tasks:[task(1,{status:'FAILURE',upstreamTaskId:'old-task'})],prompts:[{shot_no:1,prompt:'产品摄影'}]});
    const ctx = context([item]);
    const first = retry(item.id,0,[item],ctx.setItems,{},()=>{});
    await retry(item.id,0,[item],ctx.setItems,{},()=>{});
    assert.equal(submissions,1);
    assert.equal(ctx.getItems()[0].tasks[0].upstreamTaskId,undefined);
    ctx.setItems(items=>items.map(entry=>({...entry,tasks:[task(1,{id:'replacement',resultUrl:'/storage/new.png'})]})));
    finish({url:'/storage/late.png',temporary:false});
    await first;
    assert.equal(ctx.getItems()[0].tasks[0].resultUrl,'/storage/new.png');
    // Lock must be released after completion, including when the result was discarded.
    const next = retry(item.id,0,ctx.getItems(),ctx.setItems,{},()=>{});
    assert.equal(submissions,2);
    finish({url:'/storage/retried.png',temporary:false});
    await next;
    assert.equal(ctx.getItems()[0].tasks[0].resultUrl,'/storage/retried.png');
  } finally { delete globalThis.__workshopTestExecute; }
});

test('queued copy skips products deselected before their turn',async t=>{
  let finish;let calls=0;
  t.mock.method(globalThis,'fetch',()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const ctx=context([product('first'),product('second')],{analyzeConcurrency:1});
  const pending=generateAllCopywriting(ctx);
  await Promise.resolve();
  ctx.setItems(items=>items.map(item=>item.id==='second'?{...item,selected:false}:item));
  finish(copyResponse());await pending;
  assert.equal(calls,1);
  assert.equal(ctx.getItems()[1].copywriting,undefined);
});


test('copy response is discarded when source images change while writing', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const item = product('changed-source');
  const ctx = context([item]);
  const pending = generateCopywritingForProduct(item, ctx);
  ctx.setItems(items => items.map(entry => ({ ...entry, tasks: [task(1, { resultUrl: '/storage/new.png' })] })));
  finish(copyResponse());
  await pending;
  assert.equal(ctx.getItems()[0].copywriting, undefined);
  assert.match(ctx.getItems()[0].copywritingError, /成图或分镜已变化/);
  assert.equal(ctx.getItems()[0].isCopywritingGenerating, false);
});

test('rejected and redo-requested results stay out of delivery exports and batch copy inputs', async t => {
  const p = product('reviewed', { tasks: [task(1, {outputReview:'rejected'}), task(2, {outputReview:'retry_requested'}), task(3, {outputReview:'accepted'})] });
  const [row] = await buildMatrixExportRows([p], undefined, {offline:true});
  assert.equal(row['图链接1'], '/storage/3.png');
  assert.equal(row['图链接2'], '');
  assert.equal(canNativeOfflineExport([product('none', {tasks:[task(1, {outputReview:'rejected'})]})]), false);
  const bodies=[];
  t.mock.method(globalThis, 'fetch', async (_url, init) => { bodies.push(JSON.parse(init.body)); return copyResponse(); });
  const ctx = context([p, product('rejected-only', {tasks:[task(1, {outputReview:'rejected'})]})]);
  await generateAllCopywriting(ctx);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].imageUrls, ['/storage/3.png']);
  assert.equal(await generateCopywritingForProduct(ctx.getItems()[1],ctx), false);
  assert.equal(bodies.length, 1);
});
