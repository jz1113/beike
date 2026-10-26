import { describe, expect, it } from 'vitest';
import { salesProductProfile } from './salesProductProfile';

const productName = 'JEEP SPIRIT吉普卫衣男秋冬季宽松百搭假两件扎染长袖上衣男装 蓝色 XL';
const images = [
  { index: 0, role: 'main' as const, url: '/cover.jpg' },
  { index: 1, role: 'main' as const, url: '/front.jpg' },
  { index: 2, role: 'sku' as const, url: '/blue.jpg' },
  { index: 3, role: 'sku' as const, url: '/white.jpg' },
];
const variantMetadata = { version: 1 as const, requestedSkuId: '100234809783', selectedVariantId: 'blue', variants: [
  { id: 'blue', label: '蓝色', skuIds: ['100234809783', '100234809784'], imageUrls: ['/blue.jpg'] },
  { id: 'white', label: '白色 M', color: '白色', skuIds: ['100234809785'], imageUrls: ['/white.jpg'] },
] };
const base = { productName, productUrl: '100234809783', isCollected: true, images, variantMetadata,
  props: { 材质: '棉', 版型: '宽松型', 适用季节: '秋冬' },
};
const select = (...confirmedImageUrls: string[]) => ({ colorLabel: '', confirmedImageUrls, excludedImageUrls: [] });

describe('collected product profile display', () => {
  it('preserves the collected SKU and title specifications when selected main images have no variant mapping', () => {
    const input = { ...base, colorSelection: select('/cover.jpg', '/front.jpg') };
    const original = JSON.stringify(input);
    expect(salesProductProfile(input)).toEqual({ sku: '100234809783', specification: '蓝色 / XL', hasData: true });
    expect(JSON.stringify(input)).toBe(original);
  });
  it('combines associated SKU images with unmapped reference images', () => {
    expect(salesProductProfile({ ...base, colorSelection: select('/cover.jpg', '/blue.jpg') }))
      .toMatchObject({ sku: '100234809783', specification: '蓝色 / XL' });
  });
  it('preserves the source SKU when an old selected variant has no matching SKU association', () => {
    const metadata = { ...variantMetadata, selectedVariantId: 'white', variants: variantMetadata.variants.map((variant) => ({ ...variant, skuIds: [] })) };
    expect(salesProductProfile({ ...base, variantMetadata: metadata, colorSelection: select('/cover.jpg') }))
      .toMatchObject({ sku: '100234809783', specification: '蓝色 / XL' });
  });
  it.each([
    '100234809783',
    'https://item.jd.com/100234809783.html?utm_source=share',
    'https://item.m.jd.com/product/100234809783.html',
  ])('displays a legacy JD collection without variant metadata from %s', (productUrl) => {
    expect(salesProductProfile({ ...base, productUrl, variantMetadata: undefined, colorSelection: select('/cover.jpg', '/front.jpg') }))
      .toMatchObject({ sku: '100234809783', specification: '蓝色 / XL' });
  });
  it('uses an explicit marketplace SKU query without mistaking an item ID for a SKU', () => {
    const source = { ...base, variantMetadata: undefined, colorSelection: select('/cover.jpg') };
    expect(salesProductProfile({ ...source, productUrl: 'https://item.taobao.com/item.htm?id=9999999&skuId=1234567' }))
      .toMatchObject({ sku: '1234567', specification: '蓝色 / XL' });
    expect(salesProductProfile({ ...source, productUrl: 'https://item.taobao.com/item.htm?id=9999999' }).sku).toBe('');
  });
  it('switches a uniquely identified variant without copying the collected title size', () => {
    expect(salesProductProfile({ ...base, props: { 尺码: 'XL' }, colorSelection: select('/cover.jpg', '/white.jpg') }))
      .toMatchObject({ sku: '100234809785', specification: '白色 / M' });
  });
  it('does not select a SKU or reuse title specifications when references identify conflicting variants', () => {
    expect(salesProductProfile({ ...base, colorSelection: select('/blue.jpg', '/white.jpg') }))
      .toMatchObject({ sku: '', specification: '' });
  });
  it('keeps the collected SKU when an image is shared by multiple variants', () => {
    const metadata = { ...variantMetadata, variants: variantMetadata.variants.map((variant) => ({ ...variant, imageUrls: ['/cover.jpg'] })) };
    expect(salesProductProfile({ ...base, variantMetadata: metadata, colorSelection: select('/cover.jpg') }))
      .toMatchObject({ sku: '100234809783', specification: '蓝色 / XL' });
  });
  it('gives structured specifications priority over title fallback and hides general attributes', () => {
    const result = salesProductProfile({ ...base, props: { ...base.props, 尺码: '2XL' }, colorSelection: select('/cover.jpg') });
    expect(result.specification).toBe('蓝色 / 尺码：2XL');
  });
  it('ignores title size when structured color evidence conflicts with the title', () => {
    expect(salesProductProfile({ ...base, variantMetadata: undefined, props: { 颜色: '白色' } }).specification).toBe('白色');
  });
  it('does not erase the collected product identity when reference images are cleared', () => {
    expect(salesProductProfile({ ...base, colorSelection: { ...select(), excludedImageUrls: images.map((image) => image.url) } }))
      .toMatchObject({ sku: '100234809783', specification: '蓝色 / XL' });
  });
  it('does not extract SKU facts from an uncollected manual title', () => {
    expect(salesProductProfile({ productName, isCollected: false })).toEqual({ sku: '', specification: '', hasData: false });
  });
  it('does not treat wording inside a title as its selected color and size', () => {
    expect(salesProductProfile({ ...base, variantMetadata: undefined, productName: '蓝色卫衣男士 XL 宽松秋冬款' }).specification).toBe('');
  });
});
