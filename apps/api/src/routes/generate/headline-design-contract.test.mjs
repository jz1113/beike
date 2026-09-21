import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildCoverDirectorPrompt, splitCoverTitle, validateCoverDesign } from './headline-design-contract.ts';

const title = '轻盈贴合出行听得舒心';
function fixture() {
  return {
    title, titleLines: ['轻盈贴合', '出行听得舒心'],
    composition: '跨幅两行，字组与主体紧贴，不遮 Logo',
    material: '银灰金属背景，自然侧光', palette: '橙黄主字、近黑描边',
    artDirectionId: 'orange-cream-impact',
    typographySystem: 'F 橙红综艺块字配奶油描边',
    typography: '第一行宽厚斜黑，第二行紧凑白字，短硬阴影',
    visualAnchor: '开盖耳机与紧凑字组', styleFamily: '银灰橙黄器材封面',
    imagePrompt: '生成一张 3:4 竖版中文短视频最终封面。第一行「轻盈贴合」，第二行「出行听得舒心」。'
      + '标题橙黄填色与黑色描边，字组跨幅，商品保留原始结构和印字，清除商品外部的营销文字。'.repeat(7),
  };
}
test('retains full prompt and semantic line breaks without rewriting', () => {
  const input = fixture();
  const result = validateCoverDesign(input, title);
  assert.equal(result.imagePrompt, input.imagePrompt);
  assert.deepEqual(result.titleLines, ['轻盈贴合', '出行听得舒心']);
  assert.equal(result.eyebrow, '');
  assert.equal(result.supportLine, '');
  assert.equal(result.styleId, undefined);
});
test('does not truncate long detailed prompts at the old 1400-character limit', () => {
  const input = fixture();
  input.imagePrompt += '光影细节与字体比例。'.repeat(180);
  assert.ok(input.imagePrompt.length > 1400);
  assert.equal(validateCoverDesign(input, title).imagePrompt, input.imagePrompt);
});
test('rejects missing prompt rather than supplying a generic scene fallback', () => {
  assert.throws(() => validateCoverDesign({ ...fixture(), imagePrompt: '' }, title), /imagePrompt/);
});
test('recovers model-normalized titles with a system-locked title directive', () => {
  const result = validateCoverDesign({ ...fixture(), title: '戴着很舒服', titleLines: ['轻盈贴合', '出行舒心'] }, title);
  assert.deepEqual(result.titleLines, splitCoverTitle(title));
  assert.match(result.imagePrompt, /【标题文字锁定】/);
  assert.match(result.imagePrompt, /「轻盈贴合出行听得舒心」/);
});
test('locks punctuation, spaces, English, and numbers without losing a character', () => {
  const mixedTitle = '2K+144帧游戏测试， GT8 Pro表现如何';
  const lockedLines = splitCoverTitle(mixedTitle);
  assert.equal(lockedLines.join(''), mixedTitle);
  const result = validateCoverDesign({ ...fixture(), title: '2K144帧游戏测试GT8Pro表现如何', titleLines: ['2K144帧游戏测试', 'GT8Pro表现如何'] }, mixedTitle);
  assert.deepEqual(result.titleLines, lockedLines);
  assert.match(result.imagePrompt, /2K\+144帧游戏测试， GT8 Pro表现如何/);
  for (const line of lockedLines) assert.ok(result.imagePrompt.includes(`「${line}」`));
});
test('rejects a director that ignores the same-product art-direction reservation', () => {
  assert.throws(() => validateCoverDesign(fixture(), title, 'electric-blue-slant'), /艺术字预留/);
  assert.equal(validateCoverDesign(fixture(), title, 'orange-cream-impact').artDirectionId, 'orange-cream-impact');
});
test('rejects a prompt that only puts title in metadata', () => {
  assert.throws(() => validateCoverDesign({ ...fixture(), imagePrompt: '真实摄影场景。'.repeat(60) }, title), /逐行标题/);
});
test('allows a negative textless-scene instruction alongside exact title lines', () => {
  const input = fixture();
  input.imagePrompt += '不要生成无文字底图，必须直接生成带标题的最终封面。';
  assert.equal(validateCoverDesign(input, title).imagePrompt, input.imagePrompt);
});
test('director prompt commissions final artwork and makes exact input explicit', () => {
  const prompt = buildCoverDirectorPrompt('日常佩戴轻盈贴合', title, '1:1', '橙红厚重冲击字，奶油描边', 'orange-cream-impact', 'REDMI K100 Pro');
  assert.match(prompt, /1:1 正方形（最终导出 1440 × 1440）/);
  assert.match(prompt, /所有关键内容必须放在中央安全区/);
  assert.match(prompt, /标题字组必须水平居中/);
  assert.match(prompt, /上方居中大字组/);
  assert.match(prompt, /没有后续本地加字/);
  assert.match(prompt, /titleLines/);
  assert.match(prompt, /正方形画面/);
  assert.match(prompt, /A 亮黄填色/);
  assert.match(prompt, /typographySystem/);
  assert.match(prompt, /orange-cream-impact/);
  assert.match(prompt, /productNameLine/);
  assert.match(prompt, /REDMI K100 Pro/);
});
test('requires a supplied product name verbatim in the final prompt, not as inferred marketing copy', () => {
  const input = fixture();
  input.productNameLine = 'REDMI K100 Pro';
  input.imagePrompt += '商品名称「REDMI K100 Pro」放在主标题上方，字更小但清楚。';
  assert.equal(validateCoverDesign(input, title, 'orange-cream-impact', 'REDMI K100 Pro').productNameLine, 'REDMI K100 Pro');
  assert.throws(() => validateCoverDesign({ ...input, productNameLine: '红米 K100 Pro' }, title, 'orange-cream-impact', 'REDMI K100 Pro'), /商品名称/);
  assert.throws(() => validateCoverDesign({ ...input, imagePrompt: fixture().imagePrompt }, title, 'orange-cream-impact', 'REDMI K100 Pro'), /逐行标题/);
});
test('production page sends complete prompt and no longer contains fixed typography machinery', () => {
  const featureRoot = new URL('../../../../web/src/features/headline-poster/', import.meta.url);
  const sources = [
    'HeadlinePosterStudio.tsx',
    'hooks/usePosterProduction.ts',
    'api/posterApi.ts',
    'model/coverExport.ts',
    'components/PosterImportPanel.tsx',
  ].map((file) => readFileSync(new URL(file, featureRoot), 'utf8')).join('\n');
  assert.match(sources, /const prompt = designPlan.generationDirection/);
  assert.doesNotMatch(sources, /typesetCover|COVER_DIRECTIONS|STYLE_VARIANTS|extractProductAccent/);
  assert.equal((sources.match(/await submitImageGenTask\(/g) || []).length, 1);
  assert.equal((sources.match(/apiFetch\('\/api\/generate\/headline-title'/g) || []).length, 1);
  assert.equal((sources.match(/apiFetch\('\/api\/generate\/headline-design'/g) || []).length, 1);
  assert.match(sources, /完整设计与提示词.json/);
  assert.match(sources, /activeItemsRef.current.has/);
  assert.match(sources, /aspectRatio: format.aspectRatio/);
  assert.match(sources, /size: format.id === 'square' \? '1440x1440' : undefined/);
  assert.match(sources, /exportCoverJpeg\(canvas, format\)/);
  assert.match(sources, /reservedArtDirection: artDirection/);
  assert.match(sources, /productName: item\.productName/);
  assert.match(sources, /商品名称\/型号可选/);
});
