import { describe, expect, it } from 'vitest';
import { emptySalesCollection, parseSalesCollection } from './salesCollectionDraft';
import { mergeSalesCollection } from './salesCollectionMerge';
import { salesSummarySource, salesSummaryText } from './salesSummary';

const ocr = { engine: 'test', width: 10, height: 20, text: '羊毛8.3%\n亚麻2.9%', lines: [], cached: false };
function product() {
  return { ...emptySalesCollection(), productName: '条纹衫', collectedProductUrl: '1234567', props: { 面料: '混纺' },
    imageCatalog: [{ index: 0, url: '/a.png', role: 'main' as const }, { index: 5, url: '/b.png', role: 'detail' as const }, { index: 8, url: '/old.png', role: 'detail' as const }],
    colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] },
    ocrImageUrls: ['/b.png'], ocrImages: [{ imageUrl: '/b.png', result: ocr, editedText: ocr.text, confirmedText: ocr.text }, { imageUrl: '/old.png', result: ocr, editedText: '旧文字', confirmedText: '旧文字' }],
  };
}
const result = { summary: '混纺条纹衫', points: [{ feature: '棕白条纹', benefit: '搭配有层次', expression: '搭纯色下装就好看。', sources: ['image-1'] }], copy: '含羊毛8.3%、亚麻2.9%的混纺条纹衫。', copyPointIndexes: [1], conflicts: [], questions: [], cautions: [] };

describe('product selling points sources and persistence', () => {
  it('retains earlier results and copy edits, supplies new defaults, and detects earlier writing rules', () => {
    const state = product();
    const legacy: Partial<typeof result> = { ...result };
    delete legacy.cautions;
    delete legacy.copyPointIndexes;
    const saved = { result: legacy, model: 'vision', skillVersion: 'old-rules', inputKey: JSON.stringify({ rulesVersion: 2, input: salesSummarySource(state).input }), generatedAt: '2026-10-30T12:00:00.000Z', editedCopy: '手动修改的旧稿' };
    const restored = parseSalesCollection({ ...state, productSummary: saved });
    expect(restored.productSummary?.result.copy).toBe(result.copy);
    expect(restored.productSummary?.result.cautions).toEqual([]);
    expect(restored.productSummary?.result.copyPointIndexes).toEqual([]);
    expect(restored.productSummary?.editedCopy).toBe('手动修改的旧稿');
    expect(restored.productSummary?.inputKey).not.toBe(salesSummarySource(restored).inputKey);
  });
  it('submits current product facts and OCR edits, excluding old text and image URLs', () => {
    const state = { ...product(), brand: '不应发送的品牌', sellingPoints: '不应发送的补充文字' };
    const source = salesSummarySource(state);
    expect(source.error).toBe('');
    expect(source.input.textSources).toEqual([{ index: 5, text: ocr.text }]);
    expect(source.input.productFacts).toContain(state.sellingPoints);
    for (const excluded of ['旧文字', '/a.png', '/b.png']) {
      expect(source.inputKey).not.toContain(excluded);
    }
  });
  it.each([27, 65])('retains all %i OCR text sources without an image-count limit or URLs', (count) => {
    const imageCatalog = Array.from({ length: count }, (_, index) => ({ index, url: `/detail-${index}.png`, role: 'detail' as const }));
    const state = { ...emptySalesCollection(), imageCatalog,
      colorSelection: { colorLabel: '', confirmedImageUrls: imageCatalog.map((image) => image.url), excludedImageUrls: [] },
      ocrImageUrls: imageCatalog.map((image) => image.url),
      ocrImages: imageCatalog.map((image) => ({ imageUrl: image.url, editedText: `商品资料 ${image.index}`, result: ocr })),
    };
    const source = salesSummarySource(state);
    expect(source.error).toBe('');
    expect(source.input.textSources).toHaveLength(count);
    expect(source.input.textSources[count - 1]).toEqual({ index: count - 1, text: `商品资料 ${count - 1}` });
    expect(JSON.stringify(source.input)).not.toContain('/detail-');
    expect(parseSalesCollection(state).ocrImageUrls).toHaveLength(count);
  });
  it('retains OCR text when its original image becomes unavailable', () => {
    const state = product();
    state.imageCatalog = state.imageCatalog.map((image) => ({ ...image, unavailable: true }));
    expect(salesSummarySource(state).input.textSources).toEqual([{ index: 5, text: ocr.text }]);
    expect(salesSummarySource(state).error).toBe('');
  });
  it('rejects overlong OCR text without truncating it', () => {
    const state = product();
    state.ocrImageUrls = ['/b.png', '/old.png'];
    state.ocrImages[0].editedText = '字'.repeat(40_000);
    state.ocrImages[1].editedText = '字'.repeat(20_000);
    expect(salesSummarySource(state).error).toBe('');
    state.ocrImages[1].editedText += '字';
    const source = salesSummarySource(state);
    expect(source.error).toContain('60000');
    expect(source.input.textSources[1].text).toHaveLength(20_001);
  });
  it('uses available current edits even when recognition is pending or a retry failed', () => {
    const state = product(); state.ocrImages[0].editedText = '羊毛8.5%';
    expect(salesSummarySource(state).error).toBe('');
    expect(salesSummarySource(state).input.textSources[0].text).toBe('羊毛8.5%');
    expect(state.ocrImages[0].confirmedText).toBe(ocr.text);
    expect(salesSummarySource({ ...state, ocrImages: state.ocrImages.map((entry) => ({ ...entry, error: '重新识别失败' })) }).error).toBe('');
    expect(salesSummarySource({ ...state, ocrImageUrls: ['/b.png', '/old.png'], ocrImages: [state.ocrImages[0]] }).input.textSources).toEqual([{ index: 5, text: '羊毛8.5%' }]);
    state.ocrImages = [];
    expect(salesSummarySource(state).error).toBe('');
    expect(salesSummarySource({ ...product(), ocrImageUrls: [] }).error).toBe('');
    expect(salesSummarySource({ ...emptySalesCollection(), imageCatalog: state.imageCatalog }).error).toContain('识别文字');
    expect(salesSummarySource({ ...product(), ocrImages: [{ imageUrl: '/b.png', editedText: ocr.text, result: ocr }] }).error).toBe('');
  });
  it('keeps supplementary product evidence separate from OCR', () => {
    const state = { ...emptySalesCollection(), sellingPoints: '用户补充的棉质面料，支持机洗' };
    const source = salesSummarySource(state);
    expect(source.error).toBe('');
    expect(source.input).toEqual({ textSources: [],productFacts:state.sellingPoints });
    expect(parseSalesCollection(state).sellingPoints).toBe(state.sellingPoints);
  });
  it('invalidates the summary for product or OCR edits and retains previous image-based results', () => {
    const state = product(); const source = salesSummarySource(state);
    state.colorSelection.confirmedImageUrls = ['/b.png'];
    state.productName = '新名称'; state.props = { 面料: '其他成分' }; state.sellingPoints = '新补充';
    expect(salesSummarySource(state).inputKey).not.toBe(source.inputKey);
    state.ocrImages[0].editedText = '新 OCR 文字';
    expect(salesSummarySource(state).inputKey).not.toBe(source.inputKey);
    const saved = { result, model: 'vision', skillVersion: 'product-selling-points:1', inputKey: JSON.stringify({ rulesVersion: 3, input: { referenceImages: [{ index: 0, url: '/a.png' }], textImages: [] } }), generatedAt: '2026-10-30T12:00:00.000Z', editedCopy: '' };
    const parsed = parseSalesCollection({ ...product(), productSummary: saved });
    expect(parsed.productSummary).toEqual(saved);
    expect(salesSummarySource(parsed).inputKey).not.toBe(saved.inputKey);
    expect(parseSalesCollection({ productSummary: { ...saved, result: { summary: '残缺结果' } } }).productSummary).toBeUndefined();
    expect(mergeSalesCollection(parsed, emptySalesCollection(), 'another').productSummary).toBeUndefined();
  });
  it('persists partially edited final points and cleared copy without changing OCR', () => {
    const state = product();
    const edited = { ...result, summary: '', points: [{ ...result.points[0], benefit: '', feature: ' 尚在编辑 ', expression: '' }] };
    const saved = { result: edited, model: 'vision', skillVersion: 'v3', inputKey: salesSummarySource(state).inputKey, generatedAt: '2026-10-30T12:00:00.000Z', editedCopy: '' };
    const restored = parseSalesCollection({ ...state, productSummary: saved });
    expect(restored.productSummary).toEqual(saved);
    expect(restored.ocrImages).toEqual(state.ocrImages);
  });
  it('copies features, benefits, recommendation and unresolved conflicts together', () => {
    const text = salesSummaryText({ ...result, conflicts: ['面料标签与标题不一致'], questions: ['请确认实际成分'] });
    for (const expected of ['卖点：棕白条纹', '买点：搭配有层次', '8.3%', '2.9%', '资料冲突', '请确认实际成分']) expect(text).toContain(expected);
    expect(text.indexOf('买点：')).toBeLessThan(text.indexOf('卖点：'));
  });
  it('rejects invented or repeated copy references without discarding valid saved results', () => {
    const saved = { result, model: 'vision', skillVersion: 'v3', inputKey: salesSummarySource(product()).inputKey, generatedAt: '2026-10-30T12:00:00.000Z' };
    for (const indexes of [[0], [2], [1, 1], [1, 1, 1, 1]]) {
      expect(parseSalesCollection({ productSummary: { ...saved, result: { ...result, copyPointIndexes: indexes } } }).productSummary).toBeUndefined();
    }
    expect(parseSalesCollection({ productSummary: saved }).productSummary?.result.copyPointIndexes).toEqual([1]);
  });
});
