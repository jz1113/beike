import { describe, expect, it } from 'vitest';
import { addSalesOCRImages, readSalesImageDrag, salesImageDragData } from './salesImageDrag';
const images = [{ index: 3, url: '/main.png', role: 'main' as const }, { index: 17, url: '/detail.png', role: 'detail' as const }, { index: 18, url: '/broken.png', role: 'detail' as const, unavailable: true }];
describe('dragging catalog images into OCR', () => {
  it('accepts a current catalog image with its stable ID', () => {
    expect(readSalesImageDrag(salesImageDragData(images[1]), images)).toBe('/detail.png');
  });
  it('rejects external, stale, mismatched, malformed and unavailable sources', () => {
    for (const data of ['{', 'null', '{}', JSON.stringify({ version: 2, index: 17, url: '/detail.png' }), salesImageDragData({ ...images[1], index: 3 }), salesImageDragData({ ...images[1], url: 'https://outside.example/private' }), salesImageDragData(images[2]), 'x'.repeat(17000)]) {
      expect(readSalesImageDrag(data, images)).toBeNull();
    }
    expect(readSalesImageDrag(salesImageDragData(images[1]), [images[0]])).toBeNull();
  });
  it('adds only available catalog images once, without changing the catalog or product selection', () => {
    const selected = ['/main.png'];
    expect(addSalesOCRImages(images, selected, ['/detail.png', '/detail.png', '/broken.png', 'file:///tmp/a', '/foreign.png'])).toEqual(['/main.png', '/detail.png']);
    expect(selected).toEqual(['/main.png']);
    expect(images.map((image) => image.index)).toEqual([3, 17, 18]);
  });
});
