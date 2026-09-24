import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompletePromptGroup, selectPromptGroupForProduct } from './groupAssetSelection.ts';

const group = (id, title, categoryIds = []) => ({
  id, title,
  productCategoryIds: JSON.stringify(categoryIds),
  sourceImageIndices: '[1,2,3,4]',
  shotPromptsJson: JSON.stringify([1, 2, 3, 4].map((shot_no) => ({ shot_no, prompt: `镜头 ${shot_no}` }))),
});

test('automatic selection prefers a matching complete group and rejects incomplete records', () => {
  const jewelry = group('jewelry', '戒指佩戴图组', ['jewelry']);
  const phone = {
    ...group('phone', '早餐桌垫帽包', ['jewelry']), // a short title can name a prop instead of the product
    contentSummary: '浅冰蓝玻璃后盖智能手机的日常开箱图组',
  };
  const incomplete = { ...group('broken', '手机图组', ['digital']), shotPromptsJson: '[{}]' };
  assert.equal(isCompletePromptGroup(incomplete), false);
  assert.equal(isCompletePromptGroup({ ...group('empty', '手机图组', ['digital']), shotPromptsJson: '[{},{},{},{}]' }), false);
  assert.equal(isCompletePromptGroup({ ...group('duplicate', '手机图组', ['digital']), shotPromptsJson: JSON.stringify([1, 1, 3, 4].map((shot_no) => ({ shot_no, prompt: '镜头' }))) }), false);
  assert.equal(selectPromptGroupForProduct([jewelry, incomplete, phone], 'vivo X300 手机', {}, 0)?.id, 'phone');
});

test('equally matched groups rotate across products while manual selection stays separate', () => {
  const first = group('first', '手机背面展示', ['digital']);
  const second = group('second', '手机生活图组', ['digital']);
  assert.equal(selectPromptGroupForProduct([first, second], '小米手机', {}, 0)?.id, 'first');
  assert.equal(selectPromptGroupForProduct([first, second], '小米手机', {}, 1)?.id, 'second');
  assert.equal(selectPromptGroupForProduct([group('ring', '戒指特写', ['jewelry'])], '小米手机', {}, 0), null);
  assert.equal(selectPromptGroupForProduct([], '小米手机', {}, 0), null);
});
