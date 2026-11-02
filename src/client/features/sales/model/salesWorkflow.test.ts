import { describe, expect, it } from 'vitest';
import { emptySalesCollection } from './salesCollectionDraft';
import { salesWorkflow } from './salesWorkflow';
const result = { engine: 'test', width: 100, height: 100, text: '成分', lines: [], cached: false };
const base = { ...emptySalesCollection(), imageCatalog: [{ index: 0, url: '/ref', role: 'main' as const }, { index: 3, url: '/text', role: 'detail' as const }], colorSelection: { colorLabel: '', confirmedImageUrls: ['/ref'], excludedImageUrls: [] }, ocrImageUrls: ['/text'] };
describe('product preparation progress', () => {
  it('becomes ready after reference selection and recognition while preserving optional confirmations', () => {
    expect(salesWorkflow(base)).toMatchObject({ ready: false, completed: [], confirmed: [] });
    expect(salesWorkflow(base).pending).toHaveLength(1);
    const recognized = { ...base, ocrImages: [{ imageUrl: '/text', editedText: '成分', result }] };
    expect(salesWorkflow(recognized).review).toHaveLength(1);
    expect(salesWorkflow(recognized).ready).toBe(true);
    const confirmed = { ...base, ocrImages: [{ imageUrl: '/text', editedText: '成分', confirmedText: '成分', result }] };
    expect(salesWorkflow(confirmed).ready).toBe(true);
    expect(salesWorkflow({ ...confirmed, colorSelection: { ...base.colorSelection, confirmedImageUrls: [] } }).ready).toBe(false);
    expect(salesWorkflow({ ...confirmed, ocrImages: [{ ...confirmed.ocrImages[0], editedText: '修改后的文字' }] }).ready).toBe(true);
  });
  it('tracks failures, blocked originals and empty OCR separately', () => {
    const failed = salesWorkflow({ ...base, ocrImages: [{ imageUrl: '/text', editedText: '', error: '失败' }] });
    expect(failed.failed).toHaveLength(1);
    expect(failed.pending).toHaveLength(1);
    expect(salesWorkflow({ ...base, imageCatalog: base.imageCatalog.map((image) => ({ ...image, unavailable: true })) }).blocked).toHaveLength(1);
    expect(salesWorkflow({ ...base, ocrImages: [{ imageUrl: '/text', editedText: '', result }] }).ready).toBe(false);
  });
  it('keeps unavailable originals blocked even when old recognition and confirmations survive', () => {
    const state = { ...base, imageCatalog: base.imageCatalog.map((image) => image.url === '/text' ? { ...image, unavailable: true } : image),
      ocrImages: [{ imageUrl: '/text', editedText: '成分', confirmedText: '成分', result }] };
    expect(salesWorkflow(state)).toMatchObject({ ready: false, pending: [], completed: [], confirmed: [], withText: [] });
    expect(salesWorkflow(state).blocked).toHaveLength(1);
    expect(salesWorkflow({ ...state, ocrImages: [{ ...state.ocrImages[0], error: '重新识别失败' }] }).blocked).toHaveLength(1);
    expect(salesWorkflow({ ...state, imageCatalog: base.imageCatalog }).ready).toBe(true);
  });
});
