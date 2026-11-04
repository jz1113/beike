import { describe, expect, it } from 'vitest';
import { emptySalesCollection } from './salesCollectionDraft';
import { salesPlanAdaptationSourceKey, salesPlanSource, salesProductionSourceError, salesProductionSummaryIsStale } from './salesPlanSource';
import { salesSummarySource } from './salesSummary';
import { normalizeScriptTemplate } from '@shared/domain/sales';

function draft() {
  return { ...emptySalesCollection(), productName: '衬衫', props: { 成分: '棉' },
    imageCatalog: [{ index: 0, role: 'detail' as const, url: '/current.jpg' }, { index: 1, role: 'detail' as const, url: '/old.jpg' }],
    ocrImageUrls: ['/current.jpg'],
    ocrImages: ['/current.jpg', '/old.jpg'].map((imageUrl, index) => ({ imageUrl, editedText: index ? '历史资料' : '当前资料', confirmedText: index ? '历史资料' : '当前资料',
      result: { text: index ? '历史资料' : '当前资料', engine: 'test', width: 100, height: 100, lines: [], cached: false } })),
  };
}

describe('reviewed sources for sales plan adaptation', () => {
  it.each([false, true])('does not block script or manual production solely because an unused summary is stale (manual: %s)', (manual) => {
    const state = draft();
    state.productionPlan.presentationMode = 'clean_visual';
    state.productSummary = { inputKey: salesSummarySource(state).inputKey, generatedAt: '', model: 'test', skillVersion: '',
      result: { summary: '旧棉衬衫卖点', points: [], copy: '旧卖点文案', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] } };
    state.ocrImages[0].editedText = '当前更新后的资料';
    if (manual) state.productionPlan.adaptedBeats = [{ index: 0, subject: '当前商品', action: '转身展示', expression: '', transition: '', spokenLine: '', subtitle: '' }];
    const saved = state.productSummary;
    expect(salesProductionSummaryIsStale(state)).toBe(true);
    expect(salesPlanSource(state).facts).not.toContain('旧卖点文案');
    expect(salesProductionSourceError(state)).toBe('');
    expect(state.productSummary).toBe(saved);
  });

  it('still blocks automatic adaptations when their product facts change without a saved summary', () => {
    const state = draft();
    state.productionPlan.presentationMode = 'clean_visual';
    state.productionPlan.adaptedBeats = [{ index: 0, subject: '', action: '展示棉质纹理', expression: '', transition: '', spokenLine: '', subtitle: '' }];
    state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state);
    state.props = { 成分: '亚麻' };
    expect(salesProductionSourceError(state)).toContain('商品资料已更新');
  });

  it('includes collected attributes and only the current queue, retaining historical OCR locally', () => {
    const state = draft();
    expect(salesPlanSource(state)).toEqual({ facts: '成分：棉\n当前资料', error: '' });
    expect(state.ocrImages[1].confirmedText).toBe('历史资料');
  });
  it('keeps full storyboard facts and reference tracking separate from OCR-only summaries', () => {
    const state = draft();
    state.sellingPoints = '用户补充资料';
    state.productSummary = { inputKey: salesSummarySource(state).inputKey, generatedAt: '', model: 'text', skillVersion: 'test',
      result: { summary: '当前卖点', points: [], copy: '当前推荐文案', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] } };
    expect(salesPlanSource(state).facts).toBe('用户补充资料\n成分：棉\n当前资料');
    const summaryKey = salesSummarySource(state).inputKey;
    const key = salesPlanAdaptationSourceKey(state);
    for (const patch of [
      { productName: '新商品名称' }, { brand: '新品牌' }, { props: { 成分: '亚麻' } }, { sellingPoints: '新的补充资料' },
      { colorSelection: { colorLabel: '', confirmedImageUrls: ['/old.jpg'], excludedImageUrls: [] } },
    ]) {
      const changed = { ...state, ...patch };
      expect(salesSummarySource(changed).inputKey === summaryKey).toBe('colorSelection' in patch);
      expect(salesProductionSummaryIsStale(changed)).toBe(!('colorSelection' in patch));
      expect(salesPlanAdaptationSourceKey(changed)).not.toBe(key);
    }
  });
  it('uses edited OCR immediately without requiring confirmation', () => {
    const state = draft(); state.ocrImages[0].editedText = '新编辑资料';
    expect(salesPlanSource(state).error).toBe('');
    expect(salesPlanSource(state).facts).toContain('新编辑资料');
    expect(salesPlanSource(state).facts).not.toContain('当前资料');
  });
  it('tracks edited copy without treating generated or edited copy as product facts', () => {
    const state = draft();
    const result = { summary: '棉衬衫', points: [], copy: '原文案', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] };
    const saved = { inputKey: salesSummarySource(state).inputKey, generatedAt: '', model: 'vision', skillVersion: 'test', result };
    const withResult = { ...state, productSummary: { ...saved, editedCopy: '用户修改的最终文案' } };
    const key = salesPlanAdaptationSourceKey(withResult);
    expect(salesPlanSource(withResult).facts).not.toContain('用户修改的最终文案');
    expect(salesPlanSource(withResult).facts).toBe(salesPlanSource(state).facts);
    expect(salesPlanSource(withResult).facts).not.toContain('原文案');
    withResult.productSummary.editedCopy = '';
    expect(salesPlanSource(withResult).facts).not.toContain('原文案');
    expect(salesPlanAdaptationSourceKey(withResult)).not.toBe(key);
    withResult.productSummary.result = { ...result, summary: '新的最终卖点' };
    expect(salesPlanAdaptationSourceKey(withResult)).not.toBe(salesPlanAdaptationSourceKey({ ...state, productSummary: saved }));
    expect(state.ocrImages[0].editedText).toBe('当前资料');
  });
  it('allows adaptation from current facts while marking previous selling points stale', () => {
    const state = draft();
    const result = { summary: '棉衬衫', points: [], copy: '', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] };
    const productSummary = { inputKey: salesSummarySource(state).inputKey, generatedAt: new Date().toISOString(), model: 'vision', skillVersion: 'test', result };
    expect(salesPlanSource({ ...state, productSummary }).error).toBe('');
    expect(salesProductionSummaryIsStale(state)).toBe(false);
    expect(salesProductionSummaryIsStale({ ...state, productSummary })).toBe(false);
    expect(salesProductionSummaryIsStale({ ...state, productSummary, props: { 成分: '亚麻' } })).toBe(true);
    expect(salesPlanSource({ ...state, productSummary, props: { 成分: '亚麻' } })).toEqual({ facts: '成分：亚麻\n当前资料', error: '' });
    const changed = { ...state, productSummary, ocrImages: state.ocrImages.map((entry) => ({ ...entry, editedText: '更新后的 OCR 文字' })) };
    expect(salesProductionSummaryIsStale(changed)).toBe(true);
    expect(salesPlanSource(changed).facts).toContain('更新后的 OCR 文字');
    expect(productSummary.result).toBe(result);
  });
  it('does not silently truncate long facts or reuse unavailable OCR', () => {
    const state = draft();
    const tooLong = salesPlanSource({ ...state, sellingPoints: '资'.repeat(20_001) });
    expect(tooLong.error).toContain('20000');
    expect(tooLong.facts.length).toBeGreaterThan(20_000);
    const unavailable = salesPlanSource({ ...state, imageCatalog: state.imageCatalog.map((image) => ({ ...image, unavailable: true })) });
    expect(unavailable.error).toContain('识别');
    expect(unavailable.facts).not.toContain('当前资料');
  });
});

describe('adapted persona source', () => {
  it('requires missing legacy performance to be adapted or reviewed without deleting saved edits', () => {
    const state = draft();
    const beat = { index: 0, subject: '', action: '已编辑动作', spokenLine: '', subtitle: '' };
    state.productionPlan.adaptedBeats = [beat];
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '举手', expression: '看向旧门口', transition: '走向旧门口' }] }] })!;
    expect(salesProductionSourceError(state, true, script)).toContain('未独立保留表情或衔接');
    expect(state.productionPlan.adaptedBeats).toEqual([beat]);
    state.productionPlan.adaptedBeats = [{ ...beat, expression: '看向镜头浅笑', transition: '站位回稳' }];
    expect(salesProductionSourceError(state, true, script)).toBe('');
    state.productionPlan.adaptedBeats = [{ ...beat, expression: '', transition: '' }];
    expect(salesProductionSourceError(state, true, script)).toBe('');
  });
  function adapted() {
    const state = draft();
    state.productionPlan.personaId = 'person-a';
    state.productionPlan.adaptedBeats = [{ index: 0, subject: '原人物', action: '保留动作', spokenLine: '保留台词', subtitle: '' }];
    state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state);
    return state;
  }
  it('requires adaptation after the chosen person changes without deleting the previous edits', () => {
    const state = adapted();
    const beats = state.productionPlan.adaptedBeats;
    expect(salesProductionSourceError(state)).toBe('');
    state.productionPlan.personaId = 'person-b';
    expect(salesProductionSourceError(state)).toContain('出镜人物已变更');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
    state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state);
    expect(salesProductionSourceError(state)).toBe('');
  });
  it('tracks both uploaded anchors and ignores an inactive library ID for custom identities', () => {
    const state = adapted();
    state.productionPlan.customPersonaBodyUrl = '/custom.jpg';
    expect(salesProductionSourceError(state)).toContain('出镜人物已变更');
    state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state);
    state.productionPlan.personaId = 'ignored';
    expect(salesProductionSourceError(state)).toBe('');
    state.productionPlan.customPersonaFaceUrl = '/new-face.jpg';
    expect(salesProductionSourceError(state)).toContain('出镜人物已变更');
  });
  it('keeps manual beats without a source key usable and asks to refresh legacy automatic adaptations', () => {
    const state = adapted();
    state.productionPlan.adaptedSourceKey = '';
    expect(salesProductionSourceError(state)).toBe('');
    state.productionPlan.adaptedSourceKey = JSON.stringify(['script', 'product', 'fashion', 'facts']);
    expect(salesProductionSourceError(state)).toContain('尚未记录人物来源');
  });
  it('skips unused persona changes and old persona metadata for product-only scripts while retaining product checks', () => {
    const state = adapted();
    const beats = state.productionPlan.adaptedBeats;
    state.productionPlan.personaId = 'unused-new-person';
    expect(salesProductionSourceError(state, false)).toBe('');
    expect(salesProductionSourceError(state)).toContain('出镜人物已变更');
    state.productionPlan.adaptedSourceKey = JSON.stringify(['script', 'product', 'fashion', 'facts']);
    expect(salesProductionSourceError(state, false)).toContain('商品资料已更新');
    expect(salesProductionSourceError(state)).toContain('尚未记录人物来源');
    state.productSummary = { inputKey: 'old-facts', generatedAt: '', model: 'test', skillVersion: '',
      result: { summary: '', points: [], copy: '', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] } };
    expect(salesProductionSourceError(state, false)).toContain('商品资料已更新');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });
  it('keeps a product-only adaptation current when old selling points were already bypassed and an unused persona changes', () => {
    const state = adapted();
    state.productSummary = { inputKey: 'old-facts', generatedAt: '', model: 'test', skillVersion: '',
      result: { summary: '', points: [], copy: '', copyPointIndexes: [], conflicts: [], questions: [], cautions: [] } };
    state.productionPlan.personaId = 'unused-new-person';
    expect(salesProductionSourceError(state, false)).toBe('');
    const sourceFields = JSON.parse(state.productionPlan.adaptedSourceKey);
    state.productionPlan.adaptedSourceKey = JSON.stringify([...sourceFields.slice(0, 4), null]);
    expect(salesProductionSourceError(state, false)).toContain('商品资料已更新');
    state.productionPlan.adaptedSourceKey = JSON.stringify(sourceFields);
    state.props = { 成分: '亚麻' };
    expect(salesProductionSourceError(state, false)).toContain('商品资料已更新');
  });
});
