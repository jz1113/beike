import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEYWORD_VIDEO_CATEGORIES } from '@beike/contracts/generate';
import { validateResults } from './keywordReview.ts';
import { buildVideoReviewPrompt } from './keywordReviewVideo.ts';

const rows = [{ id: 'row:2', query: '狗狗日常健康' }];
const candidate = { id: 'row:2', category: '动物', producible: '制作', lowValue: '否', categoryReason: '宠物日常健康内容', rejectReason: '', needsLookup: false };

test('video category list is exact and its prompt handles personal dreams separately from explainers', () => {
  assert.equal(KEYWORD_VIDEO_CATEGORIES.length, 48);
  assert.ok(KEYWORD_VIDEO_CATEGORIES.includes('互联网 it'));
  assert.ok(KEYWORD_VIDEO_CATEGORIES.includes('姓氏 / 取名'));
  const prompt = buildVideoReviewPrompt();
  assert.match(prompt, /狗狗日常健康、猫猫喂养.*→ 动物/);
  assert.match(prompt, /单纯个人梦境描述/);
  assert.match(prompt, /版权知识、游戏攻略、院校相关、旅游内容、企业评价、星座科普和解梦科普/);
});

test('video result requires low-value marking and a category from its own list', () => {
  assert.equal(validateResults({ results: [candidate] }, rows, 'video').results[0].lowValue, '否');
  assert.deepEqual(validateResults({ results: [{ ...candidate, category: '宠物健康' }] }, rows, 'video').failedIds, ['row:2']);
  assert.deepEqual(validateResults({ results: [{ ...candidate, lowValue: undefined }] }, rows, 'video').failedIds, ['row:2']);
  assert.deepEqual(validateResults({ results: [{ ...candidate, lowValue: '是' }] }, rows, 'video').failedIds, ['row:2']);
});

test('low-value video result is rejected for production and retains its mark', () => {
  const low = { ...candidate, category: '解梦', producible: '不制作', lowValue: '是', rejectReason: '低价值：单纯个人梦境描述' };
  const result = validateResults({ results: [low] }, rows, 'video').results[0];
  assert.equal(result.producible, '不制作');
  assert.equal(result.lowValue, '是');
});
