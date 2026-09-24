import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProductSentenceShots } from './productSentenceResponse.ts';

test('product-only model responses with product_sentence pass the storyboard gate', () => {
  const rows = [1, 2, 3, 4].map((shot_no) => ({ shot_no, product_sentence: `@图片1 的商品摆放 ${shot_no}` }));
  const result = prepareProductSentenceShots(rows, 4, { productTitle: '手机' });
  assert.equal(result.parsedCount, 4);
  assert.deepEqual(result.prompts.map((shot) => shot.shot_no), [1, 2, 3, 4]);
  assert.equal(result.prompts[0].product_sentence, rows[0].product_sentence);
});

test('duplicate or empty shots do not count as separate usable results', () => {
  assert.throws(() => prepareProductSentenceShots([
    { shot_no: 1, product_sentence: '@图片1 摆放' },
    { shot_no: 1, product_sentence: '@图片1 另一次摆放' },
    { shot_no: 2, product_sentence: '' },
  ], 4, { productTitle: '手机' }), /只解析出 1\/4 个有效分镜/);
});
