import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAnalyzedStoryboard } from './batchVisionAnalyzeFormat.ts';

test('formatting feeds resolved prompts into the grid and keeps portrait badges off product/hand shots',()=>{
 const prompts=[1,2,3,4].map(shot_no=>({shot_no,assembly_source:'group_skeleton',title:`分镜${shot_no}`,prompt:`【场景结构】新场景${shot_no}\n【出镜规则】${shot_no===1?'半身人物':'仅商品与必要手部出镜'}`,scene:`新场景${shot_no}`,has_human:shot_no===1,shot_type:shot_no===1?'model_shot':'hand_held_only'}));
 const result=formatAnalyzedStoryboard({data:{prompts,applied_persona:'新人物',applied_outfit:'新套装',master_scene:'旧全局摘要'},item:{title:'手机',coverImage:'cover'},imagePayload:['chosen']});
 for(const prompt of prompts) assert.ok(result.gridPrompt.includes(prompt.prompt));
 assert.doesNotMatch(result.gridPrompt,/旧全局摘要/);
 assert.equal(result.formattedPrompts[0].applied_persona,'新人物');
 assert.equal(result.formattedPrompts[1].applied_persona,undefined);
 assert.equal(result.formattedPrompts[1].applied_outfit,undefined);
});
