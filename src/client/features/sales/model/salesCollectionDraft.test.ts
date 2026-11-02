import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySalesCollection, parseSalesCollection, readSalesCollection, SALES_COLLECTION_STORAGE_KEY, writeSalesCollection } from './salesCollectionDraft';

afterEach(() => vi.unstubAllGlobals());

function browserStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  vi.stubGlobal('window', { localStorage });
  return values;
}

describe('collection-only drafts', () => {
  it('imports product facts and selections while preserving the original creative draft', () => {
    const legacy = JSON.stringify({
      productUrl: '1234567', productName: '商品', brand: '品牌', props: { 材质: '棉', 价格: '99元' },
      imageCatalog: [{ index: 8, role: 'detail', url: '/product.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      scripts: [{ renderTaskId: 'original-task' }], analysis: { sellingPoints: ['旧分析'] }, selectedVideoModel: 'old-model',
    });
    const values = browserStorage({ 'beike.video_sales.draft.v4': legacy });
    const state = readSalesCollection();
    expect(state).toMatchObject({ productName: '商品', props: { 材质: '棉' }, imageCatalog: [{ index: 8, role: 'detail', url: '/product.jpg' }] });
    expect(state).not.toHaveProperty('scripts');
    expect(state).not.toHaveProperty('analysis');
    expect(state).not.toHaveProperty('selectedVideoModel');
    expect(state.props).not.toHaveProperty('价格');
    writeSalesCollection(state);
    expect(values.get('beike.video_sales.draft.v4')).toBe(legacy);
    expect(JSON.parse(values.get(SALES_COLLECTION_STORAGE_KEY)!)).toEqual(JSON.parse(JSON.stringify(state)));
  });

  it('keeps an explicitly cleared collection empty instead of restoring an older product', () => {
    browserStorage({ 'beike.video_sales.draft.v4': JSON.stringify({ productName: '旧商品', productImages: ['/old.jpg'] }) });
    writeSalesCollection(emptySalesCollection());
    expect(readSalesCollection().productName).toBe('');
    expect(readSalesCollection().imageCatalog).toEqual([]);
  });

  it('falls back from corrupt JSON and tolerates invalid legacy collection fields', () => {
    browserStorage({
      [SALES_COLLECTION_STORAGE_KEY]: '{',
      'beike.video_sales.draft.v3': JSON.stringify({ productName: '旧商品', productImages: ['/legacy.jpg'], colorSelection: { confirmedImageUrls: null }, props: [] }),
    });
    expect(readSalesCollection()).toMatchObject({ productName: '旧商品', imageCatalog: [{ index: 0, role: 'main', url: '/legacy.jpg' }], colorSelection: { confirmedImageUrls: [], excludedImageUrls: [] } });
    expect(parseSalesCollection({ imageCatalog: [null, { index: -1, role: 'main', url: '/bad.jpg' }], variantMetadata: { version: 1, variants: 'invalid' } }).imageCatalog).toEqual([]);
  });

  it('persists product image view tags and selected reference script ID', () => {
    const parsed = parseSalesCollection({
      selectedScriptId: 'script_abc',
      imageCatalog: [{ index: 0, role: 'main', url: '/front.jpg', view: 'front' }, { index: 1, role: 'detail', url: '/back.jpg', view: 'invalid' }],
    });
    expect(parsed.selectedScriptId).toBe('script_abc');
    expect(parsed.imageCatalog).toEqual([
      { index: 0, role: 'main', url: '/front.jpg', view: 'front' },
      { index: 1, role: 'detail', url: '/back.jpg' },
    ]);
  });
});
