import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSalesProduct, defaultSalesStudioState, hasSalesProductContent,
  readSalesStudioDraft, SALES_STUDIO_STORAGE_KEY, type VideoSalesStudioState,
} from './salesStudioDraft';

function populatedDraft(): VideoSalesStudioState {
  return {
    ...defaultSalesStudioState,
    productUrl: 'https://item.jd.com/1234567.html', productName: '连衣裙',
    brand: '品牌', priceLabel: '100元', sellingPoints: '舒适', props: { 材质: '棉' },
    imageCatalog: [{ index: 0, role: 'main', url: 'https://example.com/product.jpg' }],
    productImages: ['https://example.com/product.jpg'],
    fashionRefs: { personUrl: '/person.jpg', faceUrl: '/face.jpg', sceneUrl: '/scene.jpg' },
    scripts: [{ id: 'old', title: '旧方案', totalDuration: 0, shots: [], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' } }],
    selectedScriptIndex: 1, composedResultUrl: '/final.mp4',
    analysis: {
      productName: '连衣裙', category: 'fashion',
      visualFeatures: { mainColor: '', designStyle: '', productForm: '', texture: '' },
      sellingPoints: [], targetAudience: '', usageScenarios: [], painPoints: [],
      videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' },
    },
    collectionSource: '本地缓存', fromCache: true, detailsMissing: true,
    colorSelection: { variantId: 'black', colorLabel: '黑色', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: ['/other.jpg'] },
    variantMetadata: { version: 1, variants: [{ id: 'black', label: '黑色', skuIds: ['sku-black'], imageUrls: ['/product.jpg'] }] },
    category: 'fashion', selectedChatModel: 'chat', selectedImageModel: 'image', selectedVideoModel: 'video',
    videoMode: 'product_closeup', targetDuration: 10, aspectRatio: '3:4',
    videoResolution: '1080P', videoRefMode: 'first_frame',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('clearing the current sales product', () => {
  it('clears all product data and derived content while keeping generation preferences', () => {
    const original = populatedDraft();
    const cleared = clearSalesProduct(original);
    expect(cleared).toEqual({
      ...defaultSalesStudioState,
      category: 'fashion', selectedChatModel: 'chat', selectedImageModel: 'image', selectedVideoModel: 'video',
      videoMode: original.videoMode, targetDuration: 10, aspectRatio: '3:4',
      videoResolution: '1080P', videoRefMode: 'first_frame',
    });
    expect(cleared.collectionSource).toBeUndefined();
    expect(cleared.fromCache).toBeUndefined();
    expect(cleared.detailsMissing).toBeUndefined();
    expect(cleared.variantMetadata).toBeUndefined();
    expect(hasSalesProductContent(cleared)).toBe(false);
  });

  it('uses fresh containers without changing the previous draft or defaults', () => {
    const original = populatedDraft();
    const snapshot = structuredClone(original);
    const cleared = clearSalesProduct(original);
    for (const key of ['props', 'imageCatalog', 'productImages', 'fashionRefs', 'scripts', 'colorSelection'] as const) {
      expect(cleared[key]).not.toBe(original[key]);
      expect(cleared[key]).not.toBe(defaultSalesStudioState[key]);
    }
    expect(original).toEqual(snapshot);
    expect(defaultSalesStudioState.fashionRefs.personUrl).toBe('');
  });

  it.each<Partial<VideoSalesStudioState>>([
    { fashionRefs: { personUrl: '/person.jpg', faceUrl: '', sceneUrl: '' } },
    { scripts: populatedDraft().scripts }, { analysis: populatedDraft().analysis },
    { composedResultUrl: '/final.mp4' }, { props: { 材质: '棉' } },
    { productImages: ['/legacy.jpg'] }, { imageCatalog: populatedDraft().imageCatalog },
    { collectionSource: '缓存' }, { fromCache: false }, { detailsMissing: true },
    { brand: '品牌' }, { priceLabel: '100元' }, { sellingPoints: '舒适' }, { productUrl: '1234567' },
    { colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: ['/excluded.jpg'] } },
    { colorSelection: { variantId: 'black', colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] } },
    { variantMetadata: populatedDraft().variantMetadata },
  ])('allows clearing isolated remaining product data: %j', (patch) => {
    expect(hasSalesProductContent({ ...defaultSalesStudioState, ...patch })).toBe(true);
  });

  it('does not treat generation preferences as product content', () => {
    expect(hasSalesProductContent(defaultSalesStudioState)).toBe(false);
    expect(hasSalesProductContent({ ...clearSalesProduct(populatedDraft()), productName: '  ' })).toBe(false);
  });

  it('restores an empty product with retained preferences after saving and reopening', () => {
    const cleared = clearSalesProduct(populatedDraft());
    const getItem = vi.fn((key: string) => key === SALES_STUDIO_STORAGE_KEY ? JSON.stringify(cleared) : null);
    vi.stubGlobal('window', { localStorage: { getItem } });
    const reopened = readSalesStudioDraft();
    expect(reopened).toEqual(cleared);
    expect(hasSalesProductContent(reopened)).toBe(false);
    expect(getItem).toHaveBeenCalledWith(SALES_STUDIO_STORAGE_KEY);
  });
});
