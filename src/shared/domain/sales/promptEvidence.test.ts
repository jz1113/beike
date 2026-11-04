import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { bindBeatProductImages } from './assetRecommendation';
import { normalizeScriptTemplate } from './scriptTemplate';

function input(action = '双手揉捏内胆下摆，展示内胆回弹'): AssembleSalesPromptInput {
  const script = normalizeScriptTemplate({ durationSec: 5, voiceMode: 'none', shots: [{ beats: [{
    start: 0, end: 5, actionTemplate: action, requiredView: 'detail',
  }] }] })!;
  const selectedImages = [{ index: 0, url: '/detail.jpg', role: 'detail' as const, view: 'detail' as const }];
  return { finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
    script, productName: '当前冲锋衣', productFacts: '配有摇粒绒内胆。', selectedImages,
    beatBindings: bindBeatProductImages(script, selectedImages), persona: null, scene: null };
}

describe('sales product and performance evidence', () => {
  it('blocks the failed single-shell plan while preserving the source and manual performance', () => {
    const request = { ...input(), productName: '户外冲锋衣【单冲】', productFacts: '100%涤纶，宽松版型。' };
    const before = JSON.stringify(request), result = assembleSalesVideoPrompt(request);
    expect(result.templateError).toMatch(/第 1 段.*内胆.*单冲/);
    expect(result.enginePrompt).toBe('');
    expect(result.jimengPrompt).toBe('');
    expect(JSON.stringify(request)).toBe(before);
  });

  it.each(['无内胆', '没有内胆', '不含独立内胆', '不带内胆', '内胆：无', '内胆：否', '本款不包括内胆', '内胆不存在'])('does not treat the negative fact %s as proof of a liner', (productFacts) => {
    const result = assembleSalesVideoPrompt({ ...input(), productFacts });
    expect(result.templateError).toMatch(/第 1 段.*内胆.*冲突/);
    expect(result.enginePrompt).toBe('');
  });

  it.each(['内搭为白色V领上衣', '有透气网布内衬', '原款带内胆', '是否含内胆待确认', '不能确认是否有内胆', '内胆需单独购买', '可搭配内胆', '内胆怎么清洗？'])('does not turn %s into proof of the current liner', (productFacts) => {
    expect(assembleSalesVideoPrompt({ ...input(), productFacts }).templateError).toContain('原始资料未确认该部件');
  });

  it('does not accept generated copy and summaries as proof, even when their repeated claims agree', () => {
    const result = assembleSalesVideoPrompt({ ...input(), productFacts: '涤纶外壳', productSummary: '配有摇粒绒内胆', buyingPoints: ['可拆卸内胆'] });
    expect(result.templateError).toContain('原始资料未确认该部件');
  });

  it('rejects contradictory positive and negative source facts', () => {
    expect(assembleSalesVideoPrompt({ ...input(), productFacts: '配有内胆。不含内胆。' }).templateError).toContain('冲突');
  });

  it('accepts a confirmed liner with its bound detail view without adding evidence text to the creative prompt', () => {
    const result = assembleSalesVideoPrompt(input());
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).toContain('双手揉捏内胆下摆');
    expect(result.enginePrompt).not.toContain('配有摇粒绒内胆');
    expect(assembleSalesVideoPrompt({ ...input(), productFacts: '有无内胆：有' }).templateError).toBe('');
  });

  it('allows a documented fixed lining on a single-shell jacket without treating it as a removable liner', () => {
    const request = { ...input('展示内衬纹理'), productName: '单冲外套', productFacts: '内衬为固定透气网布。' };
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
    expect(assembleSalesVideoPrompt({ ...request, productFacts: '无内衬' }).templateError).toContain('冲突');
  });

  it.each([['内胆', '摇粒绒'], ['内衬', '涤纶'], ['衬里', '网布'], ['里布', '棉'], ['里料', '100%聚酯纤维']])('accepts the explicit collected attribute %s: %s as the named part, without conflating lining with a liner', (part, material) => {
    const request = { ...input(`轻抚${part}纹理`), productFacts: `${part}：${material}` };
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
    if (part !== '内胆') expect(assembleSalesVideoPrompt({ ...request, script: input().script }).templateError).toContain('原始资料未确认');
  });

  it('requires detachable-liner evidence for a removal action', () => {
    const request = input('拆下内胆并举起');
    expect(assembleSalesVideoPrompt(request).templateError).toContain('未确认内胆可拆卸');
    expect(assembleSalesVideoPrompt({ ...request, productFacts: '内胆可拆卸。' }).templateError).toBe('');
    expect(assembleSalesVideoPrompt({ ...request, productFacts: '内胆不可拆卸。' }).templateError).toContain('未确认内胆可拆卸');
  });

  it.each(['不展示内胆', '不生成内胆', '不要补造内胆', '不能生成内胆', '不得展示可拆卸内胆', '不把内搭当内胆', '不把内搭误当内胆', '不拆卸内胆', '不要生成内部配件'])('does not require a prohibited structure for the constraint %s', (constraint) => {
    const request = { ...input(`双手整理衣襟；${constraint}`), productName: '单冲外套', productFacts: '无内胆' };
    request.beatBindings = [];
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
  });

  it('still checks a positive part reference after a prohibition in the same clause', () => {
    const request = { ...input('不展示衣袖但展示内胆'), productFacts: '无内胆' };
    expect(assembleSalesVideoPrompt(request).templateError).toContain('冲突');
  });

  it.each(['拆开衣襟，展示内胆', '拆开衣襟后展示内胆', '展示内胆但不拆卸内胆', '展示不可拆卸内胆'])('does not turn another-object or prohibited removal into liner removal: %s', (action) => {
    expect(assembleSalesVideoPrompt({ ...input(action), productFacts: '内胆：固定' }).templateError).toBe('');
  });

  it.each(['内胆与可拆卸帽子', '配有内胆与可拆卸帽子', '内胆：摇粒绒；帽子可拆卸', '内胆可拆卸。内胆不可拆卸。'])('does not borrow removal capability or ignore a contradiction from %s', (productFacts) => {
    const result = assembleSalesVideoPrompt({ ...input('拆下内胆'), productFacts });
    expect(result.templateError).not.toBe('');
    expect(result.enginePrompt).toBe('');
  });

  it('applies removal capability to the specific lining as well as the liner', () => {
    const request = { ...input('拆下内衬'), productFacts: '内衬：固定网布' };
    expect(assembleSalesVideoPrompt(request).templateError).toContain('未确认内衬可拆卸');
    expect(assembleSalesVideoPrompt({ ...request, productFacts: '内衬可拆卸' }).templateError).toBe('');
    expect(assembleSalesVideoPrompt({ ...request, script: input('拆开衣襟，展示内衬').script }).templateError).toBe('');
    expect(assembleSalesVideoPrompt({ ...request, script: input('取下不可拆卸内衬').script }).templateError).toContain('未确认内衬可拆卸');
  });

  it('does not apply another component’s negative assertion to a positively documented liner', () => {
    expect(assembleSalesVideoPrompt({ ...input(), productFacts: '不含帽子且有内胆' }).templateError).toBe('');
  });

  it('requires the actual beat to be rebound to the part detail instead of silently using a worn reference', () => {
    const request = input();
    request.selectedImages = [{ index: 0, url: '/worn.jpg', role: 'main', view: 'worn' }, ...request.selectedImages];
    request.beatBindings = bindBeatProductImages(request.script, request.selectedImages, { 0: '/worn.jpg' });
    expect(assembleSalesVideoPrompt(request).templateError).toMatch(/第 1 段.*内胆.*重新绑定到本段/);
    request.beatBindings = bindBeatProductImages(request.script, request.selectedImages, { 0: '/detail.jpg' });
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
  });

  it('does not silently promote a detail-role upload with an unconfirmed view', () => {
    const request = input();
    request.selectedImages = [{ index: 0, url: '/detail.jpg', role: 'detail' }];
    request.beatBindings = bindBeatProductImages(request.script, request.selectedImages);
    expect(assembleSalesVideoPrompt(request).templateError).toContain('视角标为「细节」');
  });

  it('does not use a stale detail binding after the referenced image is no longer selected', () => {
    const request = input();
    request.selectedImages = [{ index: 0, url: '/worn.jpg', role: 'main', view: 'worn' }];
    expect(assembleSalesVideoPrompt(request).templateError).toContain('重新绑定到本段');
  });

  it.each(['双手捏住{{商品内部配件}}下摆', '手掌从上向下轻抚{{商品细节部位}}', '手掌从上向下轻抚商品细节部位', '指向商品细节部位', '按压商品细节部位', '拆卸商品细节部位', '展示商品细节部位，轻抚商品细节部位'])('blocks unbound product objects in %s', (action) => {
    const result = assembleSalesVideoPrompt(input(action));
    expect(result.templateError).toMatch(/第 1 段.*未(?:绑定|明确)/);
    expect(result.enginePrompt).toBe('');
  });

  it.each(['展示商品细节部位', '同时自然展现出{{商品细节部位}}的质感'])('allows a generic appearance display without treating it as component evidence: %s', (action) => {
    const request = { ...input(`比心，歪头，${action}`), productName: '外套', productFacts: '涤纶' };
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
    request.script.shots[0].beats[0].transition = '准备展示内胆';
    expect(assembleSalesVideoPrompt(request).templateError).toContain('原始资料未确认该部件');
  });

  it.each(['轻抚袖口，再将手停在该部位', '打开衣襟，露出外壳内侧', '拉开衣襟展示内部结构', '抚平商品背面'])('preserves ordinary explicit actions without demanding a liner: %s', (action) => {
    const request = { ...input(action), productName: '单冲外套', productFacts: '100%涤纶' };
    expect(assembleSalesVideoPrompt(request).templateError).toBe('');
  });

  it('checks the final transition and subject instead of only the action field', () => {
    const request = input('抬手打开衣襟');
    request.productFacts = '100%涤纶';
    request.script.shots[0].beats[0].transition = '准备展示内胆';
    expect(assembleSalesVideoPrompt(request).templateError).toContain('原始资料未确认该部件');
    const truncated = assembleSalesVideoPrompt({ ...request, truncatedEnding: true });
    expect(truncated.templateError).toBe('');
  });
});

describe('sales current scene consistency', () => {
  it('blocks outdoor performance in a known indoor scene without stripping the action or compatible daylight', () => {
    const request = input('在街头站立，双手整理衣襟');
    request.scene = { id: 'room', title: '客厅', description: '', lighting: '左窗自然光', category: '', spatialType: 'indoor',
      tags: '', suitableCategories: [], coverUrl: '/room.jpg', sourceImages: [], source: 'scene_library' };
    expect(assembleSalesVideoPrompt(request).templateError).toMatch(/第 1 段.*街头.*室内/);
    request.script.shots[0].beats[0].actionTemplate = '原地站立，双手整理衣襟';
    request.script.shots[0].beats[0].subject = '模特穿着户外冲锋衣，街头风穿搭';
    const valid = assembleSalesVideoPrompt(request);
    expect(valid.templateError).toBe('');
    expect(valid.enginePrompt).toContain('左窗自然光');
  });

  it('blocks indoor performance in a known outdoor scene and does not invent a custom scene spatial type', () => {
    const request = input('站在屋内展示商品');
    request.scene = { id: 'street', title: '街道', description: '', lighting: '', category: '', spatialType: 'outdoor',
      tags: '', suitableCategories: [], coverUrl: '/street.jpg', sourceImages: [], source: 'scene_library' };
    expect(assembleSalesVideoPrompt(request).templateError).toContain('室外场景冲突');
    expect(assembleSalesVideoPrompt({ ...request, customSceneImageUrl: '/custom.jpg' }).templateError).toBe('');
  });
});
