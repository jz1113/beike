import test from 'node:test';
import assert from 'node:assert/strict';
import { workshopAnalysisBlockReason } from './workshopAnalysisPreflight.ts';
const group = { id: 'g', title: '手机图组', sourceImageIndices: '[1,2,3,4]', shotPromptsJson: JSON.stringify([1,2,3,4].map(shot_no => ({shot_no, prompt:'手机', has_human:true}))) };
const config = { selectedArchId: 'arch', recipes: [{id:'arch'}], assetLoadState:'ready', lockedFullPromptId:'auto', lockedPersonaId:'auto', lockedOutfitId:'auto', lockedSceneId:'auto', availableFullPrompts:[group] };
const item = { id:'p', status:'success', title:'小米手机', props:{}, selectedProductImages:['image.jpg'] };
test('valid group + selected reference passes; an empty optional replacement library is allowed', () => assert.equal(workshopAnalysisBlockReason(config,item), null));
test('cover fallback, unavailable resources, missing mother group and category mismatch block before billing', () => {
  assert.match(workshopAnalysisBlockReason(config,{...item,selectedProductImages:[],coverImage:'cover.jpg'}), /参考图/);
  assert.match(workshopAnalysisBlockReason({...config,assetLoadState:'loading'},item), /加载/);
  assert.match(workshopAnalysisBlockReason({...config,assetLoadState:'error',assetLoadError:'offline'},item), /offline/);
  assert.match(workshopAnalysisBlockReason({...config,availableFullPrompts:[]},item), /母本/);
  assert.match(workshopAnalysisBlockReason({...config,availableFullPrompts:[{...group,title:'戒指珠宝',productCategoryIds:'["jewelry"]'}]},item), /母本/);
});
test('deleted, placeholder and unpublished manual bindings cannot bypass production eligibility', () => {
  for (const row of [null, {id:'x',name:'无法确认'}, {id:'x',name:'短发女性',registry:{status:'disabled'}}]) {
    assert.match(workshopAnalysisBlockReason({...config,lockedPersonaId:'x',availablePersonas:row?[row]:[]},item), /人物资产/);
  }
  assert.match(workshopAnalysisBlockReason({...config,lockedFullPromptId:'missing'},item), /图组母本/);
});
test('pure-product groups ignore dormant human bindings, matching the backend', () => {
  assert.equal(workshopAnalysisBlockReason({...config,lockedFullPromptId:'g',availableFullPrompts:[{...group,hasHuman:false}],lockedPersonaId:'deleted'},item), null);
});
