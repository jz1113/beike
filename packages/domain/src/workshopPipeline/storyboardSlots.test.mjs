import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assembleStoryboardSlots,
  buildProductOnlyVisionPrompt,
  clipProductSentence,
  fillProductSentences,
  maybeApplyJewelryCameraFallback,
  parseGroupShotSkeleton,
  expandGroupShotSkeleton,
} from './storyboardSlots.ts';
import { evaluateStoryboardQuality } from '../promptAsset/qualityChecks.ts';

const assets = {
  personas: [{ id: 'p1', name: '邻家博主', description: '东亚女生，碎发' }],
  scenes: [{ id: 's1', title: '木窗和室', description: '榻榻米与纸窗', lighting: '晨光' }],
  outfits: [{ id: 'o1', title: '米白开衫', top: '米白开衫', bottom: '直筒裤' }],
  actions: [
    { id: 'a1', title: '俯拍特写', action: '俯身展示发簪', camera: 'iPhone 24mm 人文广角', shotType: 'macro_closeup', has_human: true },
    { id: 'a2', title: '侧颜回眸', action: '侧身回眸', camera: 'iPhone 50mm', shotType: 'half_body', has_human: true },
    { id: 'a3', title: '对镜', action: '穿衣镜前整理发髻', camera: 'iPhone 35mm', shotType: 'full_body', has_human: true },
    { id: 'a4', title: '窗边', action: '倚窗看光', camera: 'iPhone 85mm', shotType: 'half_body', has_human: true },
  ],
};

test('keeps asset camera when jewelry fallback would rewrite wide lens', () => {
  const slots = assembleStoryboardSlots({ shotCount: 4, assets });
  const first = slots.shots[0];
  const framed = maybeApplyJewelryCameraFallback({
    isJewelry: true,
    cameraFromAsset: first.cameraFromAsset,
    camera: first.camera,
    angle: first.angle,
    action: first.action,
  });
  assert.equal(first.camera, 'iPhone 24mm 人文广角');
  assert.equal(framed.camera, 'iPhone 24mm 人文广角');
  assert.equal(framed.rewritten, false);
  const prompt = `场景：${first.scene}；动作：${first.action}；${clipProductSentence('锁骨光影很长的一段场景描写；佩戴 @图片1 所示发簪，侧光落在簪头')}`;
  assert.match(prompt, /木窗和室/);
  assert.match(prompt, /俯身展示发簪/);
  assert.doesNotMatch(prompt, /锁骨光影很长的一段场景描写/);
});

test('four-shot group expands to eight without changing its original shots or scene', () => {
  const originals = Array.from({ length: 4 }, (_, index) => ({
    shot_no: index + 1, title: `原镜${index + 1}`, scene: '同一间室内',
    action: `动作${index + 1}`, compositionReferenceImageUrl: `image-${index + 1}`,
  }));
  const expanded = expandGroupShotSkeleton(originals, 8);
  assert.equal(expanded.length, 8);
  assert.deepEqual(expanded.slice(0, 4), originals);
  assert.equal(expanded[4].scene, '同一间室内');
  assert.equal(expanded[4].compositionReferenceImageUrl, 'image-1');
  assert.equal(expanded[7].shot_no, 8);
});

test('locked four-shot group keeps order, camera and source scene', () => {
  const group = parseGroupShotSkeleton(JSON.stringify([
    { shot_no: 1, title: '镜1', scene: '图组原场景', action: '插簪', optics: '柔焦背景', lighting_type: '窗边侧光', camera_focal_length: '100mm 微距', angle: '发髻特写', has_human: true },
    { shot_no: 2, title: '镜2', action: '回眸', camera_focal_length: '35mm', angle: '侧后 45°', has_human: true },
    { shot_no: 3, title: '镜3', action: '近景', camera_focal_length: '50mm', has_human: true },
    { shot_no: 4, title: '镜4', action: '特写', camera_focal_length: '85mm', has_human: true },
  ]));
  const slots = assembleStoryboardSlots({ assets, lockedGroupShots: group, shotCount: 8 });
  assert.equal(slots.source, 'group_skeleton');
  assert.equal(slots.shotCount, 4);
  assert.equal(slots.shots[0].camera, '100mm 微距');
  assert.equal(slots.shots[0].scene, '图组原场景');
  assert.equal(slots.shots[0].optics, '柔焦背景');
  assert.equal(slots.shots[0].lighting, '窗边侧光');
  assert.equal(slots.shots[1].action, '回眸');
  assert.equal(slots.shots[0].sceneAsset?.id, 's1');
  assert.equal(slots.shots[0].persona?.id, 'p1');
  assert.equal(slots.shots[0].outfit?.id, 'o1');
});

test('empty library fallback is tagged unused', () => {
  const slots = assembleStoryboardSlots({
    shotCount: 4,
    assets: { personas: [{ id: 'preset-outfit-1', name: '代码预设' }], scenes: [], outfits: [], actions: [] },
  });
  assert.equal(slots.usedAssetLibrary, false);
  assert.equal(slots.source, 'fallback');
  assert.equal(slots.shots.every((shot) => shot.usedAssetLibrary === false), true);
});

test('quality checks catch repeated actions and rewritten cameras after assembly', () => {
  const assembled = fillProductSentences(assembleStoryboardSlots({ shotCount: 4, assets }), [
    { shotNo: 1, sentence: '佩戴 @图片1 所示发簪' },
  ]);
  const checks = evaluateStoryboardQuality({
    productTitle: '发簪',
    personaMode: 'asset_driven',
    shots: [
      { shotNo: 1, prompt: assembled.shots[0].action + ' 佩戴 @图片1', actionId: 'a1', shotType: 'macro_closeup', personaId: 'p1', sceneId: 's1', outfitId: 'o1', cameraFromAsset: true, expectedCamera: 'iPhone 24mm 人文广角', camera: 'iPhone 85mm 人像中近景镜头' },
      { shotNo: 2, prompt: '佩戴 @图片1', actionId: 'a1', shotType: 'half_body', personaId: 'p1', sceneId: 's2', outfitId: 'o2', cameraFromAsset: true, expectedCamera: 'iPhone 50mm', camera: 'iPhone 50mm' },
    ],
  });
  assert.ok(checks.some((item) => item.code === 'ACTION_REPEAT'));
  assert.ok(checks.some((item) => item.code === 'CAMERA_REWRITTEN'));
  assert.ok(checks.some((item) => item.code === 'SCENE_INCONSISTENT'));
  assert.ok(checks.some((item) => item.code === 'OUTFIT_INCONSISTENT'));
});

test('product-only vision prompt forbids rewriting locked slots', () => {
  const slots = assembleStoryboardSlots({ shotCount: 2, assets });
  const prompt = buildProductOnlyVisionPrompt({
    productTitle: '和田玉发簪',
    shotCount: 2,
    templateStyle: '珠宝架构骨架',
    slots: slots.shots,
  });
  assert.match(prompt, /禁止改写场景、穿搭、人设、动作、机位、景别/);
  assert.match(prompt, /product_sentence/);
  assert.doesNotMatch(prompt, /自由构想/);
});
