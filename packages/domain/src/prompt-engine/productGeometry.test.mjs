import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeImagePrompt } from './guards.ts';
import { PRODUCT_GEOMETRY_LOCK } from './productGeometry.ts';

for (const prompt of ['画面主体为 @图片1 所示商品；【构图镜头】平放俯拍', '手机背面镜头模组局部特写', '生成2x2四宫格，每格保留模板主体占比']) {
  test(`workshop geometry lock reaches final prompt: ${prompt}`, () => {
    const options = { workshopMode: 'storyboard_generate', hasHuman: false, productFingerprint: 'OPPO 手机' };
    const output = finalizeImagePrompt(prompt, options);
    assert.ok(output.includes(PRODUCT_GEOMETRY_LOCK));
    assert.match(output, /不能把整张拼图的长宽比当成机身比例/);
    assert.match(output, /镜头直径与间距/);
    assert.match(output, /合理透视/);
    assert.match(output, /不得编造毫米尺寸/);
    const repeated = finalizeImagePrompt(output, options);
    assert.equal(repeated.split('【商品几何保真约束】').length - 1, 1);
  });
}

test('plain and hub generation remain unchanged', () => {
  const prompt = '自由创作：一台幻想手机';
  for (const workshopMode of [undefined, 'plain', 'hub']) {
    assert.equal(finalizeImagePrompt(prompt, { workshopMode }), prompt);
  }
});
