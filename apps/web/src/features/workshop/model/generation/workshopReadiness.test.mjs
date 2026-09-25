import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkshopReadiness, summarizeWorkshopResults, isUsableWorkshopResult } from './workshopReadiness.ts';
const config = { generationStrategy: 'single_shot', selectedShotCount: 4 };
const product = () => ({ id: 'p', title: '手机', selectedProductImages: ['selected.jpg'], analyzedSuccess: true,
  prompts: [1,2,3,4].map((shot_no) => ({ shot_no, prompt: `镜头${shot_no}` })), tasks: [], gridPrompt: '四宫格提示词' });

test('complete four-shot products pass preflight for both strategies', () => {
  assert.equal(checkWorkshopReadiness([product()], config).canGenerate, true);
  assert.equal(checkWorkshopReadiness([product()], {...config, generationStrategy:'grid_first'}).canGenerate, true);
  assert.equal(checkWorkshopReadiness([], config).canGenerate, false);
});
test('a collected cover does not substitute for selected references', () => {
  const result = checkWorkshopReadiness([{...product(), selectedProductImages:[], coverImage:'cover.jpg'}], config);
  assert.equal(result.readyCount, 0);
  assert.equal(result.issues[0].stage, 2);
});
test('blank single prompts, shot count mismatches and interrupted tasks block generation', () => {
  const item = product(); item.prompts[2].prompt = ' ';
  assert.equal(checkWorkshopReadiness([item], config).canGenerate, false);
  assert.equal(checkWorkshopReadiness([product()], {...config,selectedShotCount:8}).canGenerate, false);
  const recovery = checkWorkshopReadiness([{...product(),tasks:[{status:'FAILURE',recoveryRequired:true}]}], config);
  assert.equal(recovery.issues[0].stage, 4);
});
test('grid validates the actual group prompt instead of unused single-shot text', () => {
  const item = product(); item.prompts.forEach(shot => { shot.prompt = ''; });
  const gridConfig = {...config,generationStrategy:'grid_first'};
  assert.equal(checkWorkshopReadiness([item], gridConfig).canGenerate, true);
  assert.equal(checkWorkshopReadiness([{...item,gridPrompt:' '}], gridConfig).canGenerate, false);
  assert.equal(checkWorkshopReadiness([item], {...gridConfig,selectedShotCount:8}).canGenerate, false);
});
test('result counts follow current task state after a successful retry', () => {
  const item = {...product(),tasks:[{status:'FAILURE'}, {status:'PENDING'}, {status:'IN_PROGRESS'}]};
  assert.equal(summarizeWorkshopResults([item]).failed, 1);
  item.tasks[0] = {status:'SUCCESS',resultUrl:'/storage/image.jpg'};
  assert.deepEqual(summarizeWorkshopResults([item]),{total:3,success:1,failed:0,pending:1,running:1,recovery:0,copyReady:0});
});
test('superseded and expired images do not count as usable delivery results', () => {
  assert.equal(isUsableWorkshopResult({status:'SUCCESS',resultUrl:'blob:old'}), false);
  const result = summarizeWorkshopResults([{...product(),tasks:[{status:'SUCCESS',resultUrl:'/storage/old.jpg',resultStatus:'superseded'},{status:'SUCCESS',resultUrl:'/storage/current.jpg'}],copywriting:{title:'标题',content:'正文'}}]);
  assert.equal(result.total,1); assert.equal(result.success,1); assert.equal(result.copyReady,1);
});


test('duplicate or invalid shot numbers cannot enter the generation queue', () => {
  const item = product(); item.prompts[1].shot_no = 1;
  assert.equal(checkWorkshopReadiness([item], config).canGenerate, false);
  item.prompts[1].shot_no = 0;
  assert.equal(checkWorkshopReadiness([item], config).canGenerate, false);
});
