import { describe, expect, it } from 'vitest';
import { normalizeCollectedImages } from './normalizeCollectedImages';
import { sanitizeCollectedItem } from './collectorUrls';

const sku = 'https://cdn.example.com/sku.jpg';
const detail = 'https://cdn.example.com/detail.jpg';

describe('collected image pipeline', () => {
  it('retains SKU/detail roles through normalization and repeated sanitization', () => {
    const data = { product: { picUrl: sku, images: [sku, detail], skuImages: [sku], detailImages: [detail] } };
    const normalized = normalizeCollectedImages(data);
    const result = sanitizeCollectedItem({ type: 'ecommerce', ...data.product, mainImages: normalized.mainImgs, skuImages: normalized.skuImgs, descImages: normalized.descImgs });
    expect(result.mainImages).toEqual([]);
    expect(result.skuImages).toEqual([sku]);
    expect(result.descImages).toEqual([detail]);
    expect(result.detailImages).toEqual([detail]);
    expect(result.images).toEqual([sku, detail]);
    expect(sanitizeCollectedItem(result)).toEqual(result);
  });

  it('retains every image beyond preview limits', () => {
    const urls = Array.from({ length: 80 }, (_, index) => `https://cdn.example.com/${index}.webp`);
    const result = sanitizeCollectedItem({ type: 'ecommerce', mainImages: urls, images: urls });
    expect(result.images).toEqual(urls);
  });

  it('keeps signed social media URLs and existing media behavior', () => {
    const source = 'https://sns-img-hw.xhscdn.com/image.webp?sign=a%2Fb';
    const result = sanitizeCollectedItem({ type: 'social', images: [source, source], video: 'https://example.com/a.mp4' });
    expect(result.images).toEqual([source]);
    expect(result.video).toBe('https://example.com/a.mp4');
  });
});
