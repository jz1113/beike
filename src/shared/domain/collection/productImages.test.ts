import { describe, expect, it } from 'vitest';
import { normalizeCollectedProductImages } from './productImages';

const image = (name: string) => `https://cdn.example.com/${name}.jpg`;

describe('normalizeCollectedProductImages', () => {
  it('merges every alias and preserves uncategorized images without changing known roles', () => {
    expect(normalizeCollectedProductImages({
      product: {
        mainImages: [image('main')], skuImages: [image('sku')],
        detailImages: [image('detail')], descImages: [image('detail2')],
        images: [image('main'), image('sku'), image('detail'), image('extra')],
      },
      images: { main: [image('main2')], skus: [image('sku2')], details: [image('detail3')] },
    })).toEqual({
      mainImgs: [image('main'), image('main2'), image('extra')],
      skuImgs: [image('sku'), image('sku2')], descImgs: [image('detail'), image('detail2'), image('detail3')],
      allImgs: ['main', 'main2', 'extra', 'sku', 'sku2', 'detail', 'detail2', 'detail3'].map(image), coverImg: image('main'),
    });
  });

  it('does not promote a cover or flattened fallback that is already a SKU/detail image', () => {
    const result = normalizeCollectedProductImages({ product: {
      picUrl: image('sku'), images: [image('sku'), image('detail')], skuImages: [image('sku')], detailImages: [image('detail')],
    } });
    expect(result.mainImgs).toEqual([]);
    expect(result.skuImgs).toEqual([image('sku')]);
    expect(result.allImgs).toEqual([image('sku'), image('detail')]);
    expect(result.coverImg).toBe(image('sku'));
  });

  it('selects the best source globally while keeping first category and position', () => {
    const signed = 'https://img14.360buyimg.com/n1/jfs/t1/a.jpg?sign=a%2Fb';
    const high = 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.jpg';
    const result = normalizeCollectedProductImages({ product: { mainImages: [signed], skuImages: ['jfs/t1/a.jpg'], descImages: [high] } });
    expect(result.mainImgs).toEqual([high]);
    expect(result.skuImgs).toEqual([]);
    expect(result.descImgs).toEqual([]);
  });

  it('keeps the first category even if its thumbnail is replaced by a signed high-resolution candidate', () => {
    const low = 'https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=low';
    const high = 'https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=high%2fb&part=+&part=%20';
    const result = normalizeCollectedProductImages({ product: { mainImages: [low], skuImages: [high] } });
    expect(result.mainImgs).toEqual([high]);
    expect(result.skuImgs).toEqual([]);
  });

  it('keeps all 80 images and is idempotent across repeated cleaning', () => {
    const urls = Array.from({ length: 80 }, (_, index) => image(String(index)));
    const result = normalizeCollectedProductImages({ product: { mainImages: urls } });
    expect(result.allImgs).toEqual(urls);
    expect(normalizeCollectedProductImages({ product: { mainImages: result.mainImgs, skuImages: result.skuImgs, detailImages: result.descImgs, images: result.allImgs, picUrl: result.coverImg } })).toEqual(result);
  });

  it('accepts stored legacy image groups and protocol-relative links', () => {
    const result = normalizeCollectedProductImages({ product: { detailUrls: JSON.stringify({ main: ['//cdn.example.com/m.jpg'], skus: [image('s')], details: [image('d')] }) } });
    expect(result.allImgs).toEqual([image('m'), image('s'), image('d')]);
  });
});
