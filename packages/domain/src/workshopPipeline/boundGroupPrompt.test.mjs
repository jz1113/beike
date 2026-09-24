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
