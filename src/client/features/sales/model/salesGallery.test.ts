import { describe, expect, it } from 'vitest';
import { galleryImages, packMasonryColumns, selectGalleryImages } from './salesGallery';

const images = [
  { index: 3, url: '/main', role: 'main' as const },
  { index: 9, url: '/detail', role: 'detail' as const },
  { index: 10, url: '/broken', role: 'detail' as const, unavailable: true },
];

describe('gallery group selection', () => {
  it('filters main, detail and selected groups without renumbering images', () => {
    expect(galleryImages(images, new Set(['/main']), 'detail').map((image) => image.index)).toEqual([9, 10]);
    expect(galleryImages(images, new Set(['/main']), 'selected').map((image) => image.index)).toEqual([3]);
  });

  it('selects a whole group without losing choices from another group or selecting broken images', () => {
    const selection = selectGalleryImages(images, new Set(['/main']), ['/detail', '/broken'], true);
    expect(selection.confirmedImageUrls).toEqual(['/main', '/detail']);
    expect(selection.excludedImageUrls).toEqual(['/broken']);
    expect(selectGalleryImages(images, new Set(selection.confirmedImageUrls), ['/detail'], false).confirmedImageUrls).toEqual(['/main']);
  });

  it('packs mixed-height images into the shortest columns to backfill vertical gaps', () => {
    const items = [
      { url: '/sq1' },
      { url: '/sq2' },
      { url: '/tall1' },
      { url: '/short1' },
      { url: '/next' },
    ];
    const ratios = {
      '/sq1': 1,
      '/sq2': 1,
      '/tall1': 1.6,
      '/short1': 0.25,
      '/next': 1,
    };
    const columns = packMasonryColumns(items, 4, ratios);
    expect(columns.map((col) => col.map((item) => item.url))).toEqual([
      ['/sq1'],
      ['/sq2'],
      ['/tall1'],
      ['/short1', '/next'],
    ]);
  });
});
