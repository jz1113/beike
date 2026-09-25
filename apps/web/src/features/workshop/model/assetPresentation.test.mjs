import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAssetBadgeText, getSharedAssetLabels, getShotAssetLabels } from './assetPresentation.ts';

const legacy = [1,2,3,4].map(i => ({
  assembly_source: 'group_skeleton', has_human: false, scene: '旧全局摘要',
  prompt: `【场景结构】场景${i}\n【光影】侧光`, applied_scene: '[#S-01] 图组原场景',
}));

test('old saved batches show real per-shot scenes without changing saved prompts', () => {
  const before = JSON.stringify(legacy);
  assert.equal(getSharedAssetLabels(legacy).scene, undefined);
  assert.deepEqual(legacy.map(shot => getShotAssetLabels(shot).scene), [1,2,3,4].map(i => `母本场景 · 场景${i}`));
  assert.equal(JSON.stringify(legacy), before);
});

test('shared scene requires matching resolved content, not just a repeated label', () => {
  const replacement = legacy.map(shot => ({ ...shot, applied_scene: '[#S-ABCD] 木桌' }));
  assert.equal(getSharedAssetLabels(replacement).scene, undefined);
  assert.equal(getSharedAssetLabels(replacement.map(shot => ({ ...shot, prompt: '【场景结构】木桌' }))).scene, '[#S-ABCD] 木桌');
});

test('hand and still life shots never inherit a product-level portrait badge', () => {
  assert.equal(getShotAssetLabels({ ...legacy[0], applied_persona: '旧人物' }, '全组人物').persona, '');
  assert.equal(getShotAssetLabels({ ...legacy[0], has_human: true, shot_type: 'hand_held_only' }, '全组人物').persona, '');
});

test('badge preserves real stable codes but does not manufacture positional codes', () => {
  assert.equal(formatAssetBadgeText('母本场景 · 木桌'), '母本场景 · 木桌');
  assert.equal(formatAssetBadgeText('[#S-abcd] 木桌'), '[#S-ABCD] 木桌');
  assert.equal(formatAssetBadgeText('[#R-abcd] 母组'), '[#R-ABCD] 母组');
});
