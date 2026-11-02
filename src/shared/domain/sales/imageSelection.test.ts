import { describe, expect, it } from 'vitest';
import { eligibleSalesImages } from './imageSelection';
import { appendSalesImages, buildSalesImageCatalog } from './imageCatalog';

describe('collected product images', () => {
  const images = [{ index: 2, role: 'main' as const, url: '/black.jpg' }, { index: 8, role: 'detail' as const, url: '/detail.jpg' }];
  const selection = { colorLabel: '黑色', variantId: 'black', confirmedImageUrls: [] as string[], excludedImageUrls: [] as string[] };
  const metadata = { version: 1 as const, variants: [{ id: 'black', label: '黑色', color: '黑色', skuIds: ['1234567'], imageUrls: ['/black.jpg'] }] };

  it('keeps stable image identifiers and ignores duplicate uploads', () => {
    expect(appendSalesImages(images, ['/new.jpg', '/black.jpg', '/other.jpg'])).toEqual([
      ...images, { index: 9, role: 'main', url: '/new.jpg' }, { index: 10, role: 'main', url: '/other.jpg' },
    ]);
    expect(images.map((image) => image.index)).toEqual([2, 8]);
    expect(buildSalesImageCatalog({ mainImages: ['/same.jpg'], skuImages: ['/same.jpg', '/sku.jpg'] }).map((image) => image.role)).toEqual(['main', 'sku']);
  });

  it('requires explicit confirmation when an image maps to different colors', () => {
    const conflict = { ...metadata, variants: [...metadata.variants, { ...metadata.variants[0], id: 'white', color: '白色' }] };
    expect(eligibleSalesImages(images, selection, metadata)).toEqual([images[0]]);
    expect(eligibleSalesImages(images, selection, conflict)).toEqual([]);
    expect(eligibleSalesImages(images, { ...selection, confirmedImageUrls: ['/black.jpg'] }, conflict)).toEqual([images[0]]);
  });

  it('honors manual selections and excludes unavailable images', () => {
    const direct = { colorLabel: '', confirmedImageUrls: ['/black.jpg', '/detail.jpg'], excludedImageUrls: ['/black.jpg'] };
    expect(eligibleSalesImages(images, direct)).toEqual([images[1]]);
    expect(eligibleSalesImages(images.map((image) => ({ ...image, unavailable: true })), direct)).toEqual([]);
  });
});
