import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFidelityGuidance, buildProductFidelityGuidance } from './fidelity.ts';

test('phone prompts add front/screen fidelity without inventing unseen details', () => {
  const prompt = appendFidelityGuidance('@图片1 手机正面展示', {
    productFingerprint: 'Apple iPhone 手机',
    hasHuman: false,
    hasSupplementaryProductViews: true,
  });
  assert.match(prompt, /商品外观保真约束/);
  assert.match(prompt, /屏幕比例/);
  assert.match(prompt, /参考图未展示的屏幕细节不要凭空补造/);
  assert.match(prompt, /补充视图/);
  assert.doesNotMatch(prompt, /真人摄影约束/);
});

test('non-phone products do not receive phone-specific geometry wording', () => {
  const prompt = buildProductFidelityGuidance({ productFingerprint: '真丝方巾' });
  assert.doesNotMatch(prompt, /屏幕比例|前摄开孔/);
  assert.match(prompt, /商品外观保真约束/);
});

test('human guidance is idempotent', () => {
  const once = appendFidelityGuidance('人物生活抓拍', { productFingerprint: '手机', hasHuman: true });
  const twice = appendFidelityGuidance(once, { productFingerprint: '手机', hasHuman: true });
  assert.equal(twice, once);
  assert.equal((twice.match(/真人摄影约束/g) || []).length, 1);
});
