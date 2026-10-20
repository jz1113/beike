import { describe, expect, it } from 'vitest';
import { collectedProductImageIdentity, normalizeCollectedProductImage, parseCollectedProductImage } from './productImageUrls';
import { normalizeImageUrlToStandardJpg } from './imageUrls';

const jd = 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/product.jpg';

describe('collected product image URLs', () => {
  it.each([
    ['//img14.360buyimg.com/n0/s60x60_jfs/t1/product.jpg!q70', jd],
    ['jfs/t1/product.jpg', jd],
    ['https://img13.360buyimg.com/n1/jfs/t1/product.jpg.dpg.webp', jd],
    ['https://img.alicdn.com/imgextra/a.jpg_60x60.jpg_.webp', 'https://img.alicdn.com/imgextra/a.jpg'],
    ['https://img.alicdn.com/imgextra/a.png_300x300.jpg', 'https://img.alicdn.com/imgextra/a.png'],
    ['https://cdn.example.com/native.webp', 'https://cdn.example.com/native.webp'],
    ['https://img10.360buyimg.com/jfs/t1/native.webp', 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/native.webp'],
    ['https://img.pddpic.com/native.webp', 'https://img.pddpic.com/native.webp'],
    ['https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg', 'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg'],
    ['https://img.alicdn.com/a.jpg_80x80q90.jpg?sign=x', ''],
    ['https://img.alicdn.com/a.jpg_80x80.unrecognized', ''],
    ['https://img.alicdn.com/a.jpg_80x80q90.jpg', 'https://img.alicdn.com/a.jpg'],
    ['https://cdn.example.com/a-80x80.jpg', ''],
    ['https://example.com/s60x60/a.jpg', ''],
    ['https://example.com/a.jpg?width=60&height=60', ''],
    ['https://item.jd.com/1234567.html', ''],
    ['https://example.com/video.mp4', ''],
    ['https://example.com/blank.gif', ''],
    ['javascript:alert(1)', ''],
  ])('normalizes %s safely', (source, expected) => {
    expect(normalizeCollectedProductImage(source)).toBe(expected);
  });

  it('keeps every byte of signed addresses', () => {
    const source = 'https://img14.360buyimg.com/n1/jfs/t1/product.jpg?sign=a%2fb+Z&expires=9#keep';
    expect(normalizeCollectedProductImage(source)).toBe(source);
    expect(collectedProductImageIdentity(source)).toBe(collectedProductImageIdentity(jd));
    expect(normalizeCollectedProductImage('https://img14.360buyimg.com/n1/s60x60_jfs/t1/product.jpg?sign=x')).toBe('');
  });

  it.each([
    ['https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=x', true],
    ['https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=x', false],
    ['https://cdn.example.com/a.jpg?imageView2/1/w/80/h/80&sign=x', true],
    ['https://cdn.example.com/a.jpg?x-oss-process=image/resize,w_80,h_80&Signature=x', true],
    ['https://cdn.example.com/a.jpg?w=80&sign=x', true],
  ])('matches Go thumbnail classification for %s', (source, small) => {
    expect(parseCollectedProductImage(source)).toMatchObject({ url: source, small });
  });

  it('preserves empty trailing queries', () => {
    const source = 'https://img14.360buyimg.com/n0/jfs/t1/a.webp?';
    expect(normalizeCollectedProductImage(source)).toBe(source);
  });

  it('does not merge unknown CDN query variants', () => {
    expect(collectedProductImageIdentity('https://cdn.example.com/a.jpg?variant=1'))
      .not.toBe(collectedProductImageIdentity('https://cdn.example.com/a.jpg?variant=2'));
  });

  it('preserves high-resolution and signed URLs during downstream rendering', () => {
    for (const source of [
      'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg',
      'https://img14.360buyimg.com/n0/jfs/t1/a.webp?',
      'https://img.alicdn.com/a.jpg_unknown.webp',
    ]) expect(normalizeImageUrlToStandardJpg(source)).toBe(source);
  });

  it('does not change native formats during downstream rendering', () => {
    for (const source of ['https://img10.360buyimg.com/jfs/t1/a.webp', 'https://img.alicdn.com/a.webp', 'https://img.pddpic.com/a.webp']) {
      expect(normalizeImageUrlToStandardJpg(source)).toMatch(/\.webp$/);
    }
  });
});
