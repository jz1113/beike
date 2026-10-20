import { describe, expect, it } from 'vitest';
import { alignProductVariantImages, readProductVariantMetadata } from './productVariants';

const variant = { id: '1627207:1', label: '黑色', color: '黑色', skuIds: ['1234567'], imageUrls: ['//img.alicdn.com/black.jpg_50x50.jpg'] };

describe('readProductVariantMetadata', () => {
  it('reads JSON drafts, normalizes arrays, and never infers selected state', () => {
    expect(readProductVariantMetadata(JSON.stringify({ version: 1, variants: [variant], requestedSkuId: '1234567' }))).toEqual({
      version: 1, variants: [{ ...variant, imageUrls: ['https://img.alicdn.com/black.jpg'] }], requestedSkuId: '1234567',
    });
    expect(readProductVariantMetadata({ version: 1, variants: [{ ...variant, label: '未知', color: undefined }] })?.variants[0].color).toBeUndefined();
    expect(readProductVariantMetadata({ version: 1, variants: [] })).toEqual({ version: 1, variants: [] });
  });

  it('rejects malformed metadata and unsupported versions without throwing', () => {
    for (const input of [null, 'bad json', [], { version: 2, variants: [] },
      { version: 1, variants: [null] }, { version: 1, variants: [{ ...variant, label: '' }] },
      { version: 1, variants: [{ ...variant, skuIds: [1] }] },
      { version: 1, variants: [{ ...variant, imageUrls: null }] },
      { version: 1, variants: [variant, variant] },
      { version: 1, variants: [variant], selectedVariantId: 'missing' },
    ]) expect(readProductVariantMetadata(input)).toBeUndefined();
  });

  it('keeps signed-thumbnail identity until aligning to a full-size catalog copy', () => {
    const metadata = readProductVariantMetadata({ version: 1, variants: [{ ...variant, imageUrls: ['https://img13.360buyimg.com/n5/jfs/t1/a.webp?sign=small'] }] })!;
    const large = 'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp?sign=large';
    expect(alignProductVariantImages(metadata, [large]).variants[0].imageUrls).toEqual([large]);
  });

  it('aligns one shared image to multiple variants using the actual catalog URL', () => {
    const metadata = readProductVariantMetadata({ version: 1, variants: [variant, { ...variant, id: '1627207:2', label: '灰色' }] })!;
    const aligned = alignProductVariantImages(metadata, ['https://img.alicdn.com/black.jpg']);
    expect(aligned.variants.map(item => item.imageUrls)).toEqual([
      ['https://img.alicdn.com/black.jpg'], ['https://img.alicdn.com/black.jpg'],
    ]);
    expect(alignProductVariantImages(metadata, []).variants[0].imageUrls).toEqual([]);
  });
});
