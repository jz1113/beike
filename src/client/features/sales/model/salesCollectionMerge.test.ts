import { describe, expect, it } from 'vitest';
import { emptySalesCollection } from './salesCollectionDraft';
import { mergeSalesCollection } from './salesCollectionMerge';
const source = 'https://item.jd.com/1234567.html';
const result = { engine: 'test', width: 100, height: 100, text: '原文', lines: [], cached: false };
describe('recollecting a product', () => {
  const previous = { ...emptySalesCollection(), productUrl: source, collectedProductUrl: source, productName: '手动修改名称', sellingPoints: '手动特点', props: { 材质: '核对后的材质' },
    imageCatalog: [{ index: 8, url: '/original', role: 'main' as const, unavailable: true }, { index: 15, url: '/upload', role: 'main' as const }],
    colorSelection: { colorLabel: '', confirmedImageUrls: ['/upload'], excludedImageUrls: [] }, ocrImageUrls: ['/original'], ocrImages: [{ imageUrl: '/original', editedText: '编辑', confirmedText: '收录', result }],
  };
  const product = { ...emptySalesCollection(), productUrl: source, productName: '采集名称', imageCatalog: [{ index: 0, url: '/original', role: 'detail' as const }, { index: 1, url: '/new', role: 'detail' as const }], fromCache: true };
  it('keeps manual facts, uploads, image IDs, OCR edits and confirmations for the same source', () => {
    const merged = mergeSalesCollection(previous, product, source);
    expect(merged).toMatchObject({ productName: '手动修改名称', sellingPoints: '手动特点', props: { 材质: '核对后的材质' }, fromCache: true });
    expect(merged.imageCatalog.map((image) => [image.index, image.url])).toEqual([[8, '/original'], [15, '/upload'], [16, '/new']]);
    expect(merged.imageCatalog[0]).toMatchObject({ role: 'detail', unavailable: undefined });
    expect(merged.ocrImages).toEqual(previous.ocrImages);
    expect(merged.colorSelection).toEqual(previous.colorSelection);
    expect(merged.ocrImageUrls).toEqual(['/original']);
    expect(previous.imageCatalog[0].unavailable).toBe(true);
  });
  it('starts fresh for a different source while retaining the new collection identity', () => {
    const merged = mergeSalesCollection(previous, product, 'https://item.jd.com/9999999.html');
    expect(merged).toMatchObject({ productName: '采集名称', ocrImages: [], ocrImageUrls: [], collectedProductUrl: 'https://item.jd.com/9999999.html' });
    expect(merged.colorSelection.confirmedImageUrls).toEqual([]);
    expect(merged.imageCatalog).toEqual(product.imageCatalog);
  });
});
