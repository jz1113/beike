import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleStoryboardSlots, parseGroupShotSkeleton } from '@beike/domain/workshopPipeline';
import { boundGroupAssetLabels } from './boundGroupAssetLabels.ts';
import { formatAssetWithCode } from './promptAssemblerFormat.ts';

const slots = (patch = {}) => assembleStoryboardSlots({
  lockedGroupShots: parseGroupShotSkeleton([1, 2, 3, 4].map(shot_no => ({
    shot_no, has_human: shot_no === 1,
    prompt: `【场景结构】台面${shot_no}\n【发型与面部】本镜人物\n【穿搭】本镜外套`,
  }))),
  assets: {
    scenes: [{ title: '图组原场景', description: '整组场景摘要' }],
    personas: [{ name: '图组原人物', description: '整组人物摘要' }],
    outfits: [{ title: '图组原穿搭', top: '整组穿搭摘要' }],
  }, ...patch,
}).shots;

test('inherited labels describe each resolved shot, not a shared synthetic asset', () => {
  const labels = slots().map(boundGroupAssetLabels);
  assert.equal(new Set(labels.map(label => label.applied_scene)).size, 4);
  assert.deepEqual(labels.map(label => label.applied_scene), [1,2,3,4].map(i => `母本场景 · 台面${i}`));
  assert.equal(labels[0].applied_persona, '母本人物 · 本镜人物');
  assert.equal(labels[0].applied_outfit, '母本穿搭 · 本镜外套');
  assert.equal(labels[1].applied_persona, undefined);
  assert.equal(labels[1].applied_outfit, undefined);
  assert.doesNotMatch(JSON.stringify(labels), /S-01|P-01|O-01|整组.*摘要/);
});

test('explicit replacement keeps real asset code and binding', () => {
  const [slot] = slots({ replaceScene: true, assets: {
    scenes: [{ id: 'scene-new', code: 'S-new', title: '新台面', description: '大理石', lighting: '日光' }],
    personas: [{ id: 'person-new', code: 'P-new', name: '新人物' }],
    outfits: [{ id: 'outfit-new', code: 'O-new', title: '新外套' }],
  } });
  assert.deepEqual(boundGroupAssetLabels(slot), {
    applied_scene: '[#S-new] 新台面', applied_persona: '[#P-new] 新人物', applied_outfit: '[#O-new] 新外套',
  });
  assert.equal(slot.scene, '新台面，大理石');
});

test('formatting never invents an asset code for a group summary', () => {
  assert.equal(formatAssetWithCode(undefined, [{ title: '图组原场景' }], 'S'), '图组原场景');
  assert.equal(formatAssetWithCode('场景说明', [], 'S'), '场景说明');
  assert.equal(formatAssetWithCode(undefined, [{ title: '木桌', code: 'S-1234' }], 'S'), '[#S-1234] 木桌');
});
