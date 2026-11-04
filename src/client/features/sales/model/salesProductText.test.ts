import { describe, expect, it } from 'vitest';
import { emptySalesCollection, parseSalesCollection } from './salesCollectionDraft';
import { editSalesProductText, salesProductTextParts } from './salesProductText';
import { salesSummarySource } from './salesSummary';

const draft = {
  ...emptySalesCollection(), sellingPoints: '介绍',
  imageCatalog: ['a', 'b'].map((url, index) => ({ url, index, role: 'detail' as const })),
  ocrImageUrls: ['a', 'b'],
  ocrImages: [{ imageUrl: 'a', editedText: '材质' }, { imageUrl: 'b', editedText: '尺码' }],
};
const read = (state: typeof draft | ReturnType<typeof emptySalesCollection>) => salesProductTextParts(state).map((part) => part.text).join('');
describe('single product text editor', () => {
  it('preserves source boundaries, deletions and replacements across a saved draft', () => {
    const initial = read(draft);
    expect(initial).toBe('介绍\n\n材质\n\n尺码');
    for (let start = 0; start <= initial.length; start++) {
      for (let end = start; end <= initial.length; end++) {
        for (const insert of ['', '棉', '\n']) {
          const next = initial.slice(0, start) + insert + initial.slice(end);
          const patch = editSalesProductText(draft, next, start + insert.length);
          expect(read(parseSalesCollection({ ...draft, ...patch }))).toBe(next);
        }
      }
    }
  });
  it('sends revised text with its source and excludes removed images', () => {
    const patch = editSalesProductText(draft, read(draft).replace('材质', '纯棉'), 6);
    const edited = { ...draft, ...patch };
    expect(salesSummarySource(edited).input.textSources).toEqual([{ index: 0, text: '纯棉' }, { index: 1, text: '尺码' }]);
    expect(read({ ...edited, ocrImageUrls: ['b'] })).toBe('介绍\n\n尺码');
    expect(read({ ...edited, ocrImageUrls: ['a'] })).toBe('介绍\n\n纯棉');
  });
});
