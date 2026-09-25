import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleStoryboardSlots, parseGroupShotSkeleton } from './storyboardSlots.ts';
import { buildBoundGroupPrompt } from './boundGroupPrompt.ts';
import { getDynamicNegativePrompt } from '../prompt-engine/guards.ts';

test('bound still life preserves each source scene without injecting a portrait or a lens', () => {
  const shots = parseGroupShotSkeleton([
    { title: '桌面静物', has_human: false, scene: '整组场景摘要', prompt: '【场景结构】木质桌面\n【构图镜头】俯拍', action: '手机平放' },
    { title: '石台静物', has_human: false, scene: '整组场景摘要', prompt: '【场景结构】石质台面', action: '手机直立' },
  ]);
  const result = assembleStoryboardSlots({ lockedGroupShots: shots });
  assert.equal(result.shots[0].scene, '木质桌面');
  assert.equal(result.shots[1].scene, '石质台面');
  const prompt = buildBoundGroupPrompt(result.shots[0], '小米手机');
  assert.doesNotMatch(prompt, /私服|博主|85mm|同一位模特/);
  assert.match(prompt, /木质桌面/);
});

test('hand-only scenes preserve hands without using persona or outfit assets', () => {
  const shots = parseGroupShotSkeleton([{ has_human: true, shot_type: 'hand_held_only', action: '右手握持手机' }]);
  const slot = assembleStoryboardSlots({ lockedGroupShots: shots, assets: {
    personas: [{ id: 'p', description: '旧人物' }], outfits: [{ id: 'o', top: '旧上衣' }],
  } }).shots[0];
  assert.equal(slot.hasHuman, false);
  const prompt = buildBoundGroupPrompt(slot, '手机');
  assert.match(prompt, /仅商品与必要手部出镜/);
  assert.doesNotMatch(prompt, /旧人物|旧上衣|禁止.*手部/);
  const negative = getDynamicNegativePrompt({ hasHuman: false, shotType: 'hand_held_only' });
  assert.doesNotMatch(negative, /human limbs/);
  assert.match(negative, /human face/);
});

test('explicit scene override removes original scene and original lighting', () => {
  const slot = assembleStoryboardSlots({
    lockedGroupShots: [{ prompt: '【场景结构】旧房间\n【光影】旧灯光', action: '商品平放', has_human: false }],
    assets: { scenes: [{ id: 's', title: '新场景', description: '白色台面', lighting: '侧窗光' }] },
  }).shots[0];
  const prompt = buildBoundGroupPrompt(slot, '手机');
  assert.match(prompt, /白色台面/);
  assert.match(prompt, /侧窗光/);
  assert.doesNotMatch(prompt, /旧房间|旧灯光/);
});

import { buildBoundGroupGridPrompt } from './boundGroupPrompt.ts';

test('scene replacement wins even when the source has structured scene and light',()=>{
 const slot=assembleStoryboardSlots({replaceScene:true,lockedGroupShots:[{scene:'旧房间',lighting_type:'旧灯光',has_human:false}],assets:{scenes:[{id:'new',description:'新台面',lighting:'新窗光'}]}}).shots[0];
 const prompt=buildBoundGroupPrompt(slot,'手机');assert.match(prompt,/新台面/);assert.match(prompt,/新窗光/);assert.doesNotMatch(prompt,/旧房间|旧灯光/);
});
test('retained outfit uses source details; explicit replacements do not fall back to old identities',()=>{
 const shots=[{has_human:true,shot_type:'model_shot',prompt:'【发型与面部】旧人物\n【穿搭】旧衬衫'}];
 const retained=assembleStoryboardSlots({lockedGroupShots:shots}).shots[0];
 assert.match(buildBoundGroupPrompt({...retained,hasHuman:true},'手机'),/旧衬衫/);
 const replaced=assembleStoryboardSlots({lockedGroupShots:shots,assets:{personas:[{id:'p',name:'新人物'}],outfits:[{id:'o',title:'新套装'}]}}).shots[0];
 const prompt=buildBoundGroupPrompt(replaced,'手机');assert.match(prompt,/新人物/);assert.match(prompt,/新套装/);assert.doesNotMatch(prompt,/旧人物|旧衬衫/);
});
test('grid preserves all resolved per-shot bindings without a global portrait or scene rewrite',()=>{
 const shots=['【人物】新人物\n【穿搭】新衣服','仅商品与必要手部出镜','纯商品静物\n【场景结构】窗边桌面','纯商品静物\n【场景结构】石台'].map((prompt,index)=>({prompt,shot_no:index+1}));
 const grid=buildBoundGroupGridPrompt(shots);
 for(const shot of shots) assert.ok(grid.includes(shot.prompt));
 assert.match(grid,/左上格·分镜1/);assert.match(grid,/右下格·分镜4/);
 assert.throws(()=>buildBoundGroupGridPrompt(shots.slice(1)),/四个完整/);
});

test('group-level appearance summaries cannot overwrite per-shot mother-group details', () => {
  const shots = parseGroupShotSkeleton([1,2].map(i => ({ has_human: true, prompt:
    `【发型与面部】镜${i}人物细节\n【穿搭】镜${i}服装细节\n【场景结构】镜${i}空间\n【动作或摆放】镜${i}摆放\n【光影】镜${i}窗光` })));
  const slots = assembleStoryboardSlots({ lockedGroupShots: shots, assets: {
    scenes: [{ title: '图组原场景', description: '全组场景摘要' }],
    personas: [{ name: '图组原人物', description: '全组人物摘要' }],
    outfits: [{ title: '图组原穿搭', top: '全组穿搭摘要' }],
  } }).shots;
  slots.forEach((slot, i) => {
    const prompt = buildBoundGroupPrompt(slot, '手机');
    for (const detail of ['人物细节', '服装细节', '空间', '摆放', '窗光']) assert.ok(prompt.includes(`镜${i+1}${detail}`));
    assert.doesNotMatch(prompt, /全组.*摘要|图组原场景/);
  });
});

test('mother-group summary remains a fallback when a shot has no finer details', () => {
  const [slot] = assembleStoryboardSlots({ lockedGroupShots: [{ has_human: true }], assets: {
    scenes: [{ title: '图组原场景', description: '窗边木桌' }],
    personas: [{ description: '短发人物' }], outfits: [{ top: '米色外套' }],
  } }).shots;
  const prompt = buildBoundGroupPrompt(slot, '手机');
  assert.match(prompt, /窗边木桌/); assert.match(prompt, /短发人物/); assert.match(prompt, /米色外套/);
  assert.doesNotMatch(prompt, /图组原场景/);
});
