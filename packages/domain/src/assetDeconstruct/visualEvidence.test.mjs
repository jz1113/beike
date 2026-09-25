import test from 'node:test';
import assert from 'node:assert/strict';
import { canExtractOutfit, canExtractPersona, hasReusableOutfitText, visualAssetIssue } from './visualEvidence.ts';

test('a sleeve fragment is not promoted to an outfit asset', () => {
  assert.equal(hasReusableOutfitText({ title: '局部深色袖口', top: '仅见袖口', bottom: '无法确认' }), false);
  assert.equal(visualAssetIssue({ title: '浅色上衣局部', top: '仅浅色长袖袖口' }, 'outfit') !== null, true);
  assert.equal(canExtractOutfit({ image_index: 1, image_type: 'photography', reverse_prompt_zh: '', dimensions: {}, has_human: true, outfit_visibility: 'fragment', outfit: { title: '局部深色袖口', top: '仅见袖口', bottom: '' } }), false);
});

test('a hand-only image cannot create a persona, while a clear face and hair can', () => {
  assert.equal(canExtractPersona({ image_index: 1, image_type: 'photography', reverse_prompt_zh: '', dimensions: {}, has_human: true, persona_visibility: 'partial', persona: { face: '无法确认', hair: '无法确认' } }), false);
  assert.equal(canExtractPersona({ image_index: 2, image_type: 'photography', reverse_prompt_zh: '', dimensions: {}, has_human: true, persona_visibility: 'identifiable', persona: { face: '自然鹅蛋脸', hair: '深色中长发' } }), true);
});
