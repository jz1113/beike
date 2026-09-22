import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStoryboardQuality } from './qualityChecks.ts';

test('detects missing product anchors and repeated actions', () => {
  const checks = evaluateStoryboardQuality({
    productTitle: '珍珠项链',
    personaMode: 'asset_driven',
    shots: [
      { shotNo: 1, prompt: '窗边人像', actionId: 'a1', shotType: 'half_body', personaId: 'p1' },
      { shotNo: 2, prompt: '街拍氛围', actionId: 'a1', shotType: 'half_body', personaId: 'p2' },
    ],
  });
  assert.ok(checks.some((item) => item.code === 'PRODUCT_ANCHOR_WEAK'));
  assert.ok(checks.some((item) => item.code === 'ACTION_REPEAT'));
  assert.ok(checks.some((item) => item.code === 'PERSONA_INCONSISTENT'));
});

test('pure product forbids human shots', () => {
  const checks = evaluateStoryboardQuality({
    productTitle: '无线耳机',
    productFingerprint: '耳机',
    personaMode: 'none',
    shots: [
      { shotNo: 1, prompt: '耳机特写', hasHuman: true, shotType: 'macro_closeup' },
    ],
  });
  assert.ok(checks.some((item) => item.code === 'PURE_PRODUCT_HUMAN'));
});
