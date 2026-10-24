import { describe, expect, it } from 'vitest';
import { mapCollectedSalesProduct, parseProductLink } from './productLink';

describe('parseProductLink', () => {
  it('accepts one ecommerce url and blocks social links', () => {
    expect(parseProductLink('https://item.jd.com/1000123456.html')).toEqual({
      ok: true,
      url: 'https://item.jd.com/1000123456.html',
      platform: 'jd',
    });
    expect(parseProductLink('https://detail.tmall.com/item.htm?id=1')).toMatchObject({ ok: true, platform: 'taobao' });
    const social = parseProductLink('https://www.xiaohongshu.com/discovery/item/abc');
    expect(social.ok).toBe(false);
    if (!social.ok) expect(social.error).toContain('万邦只采集电商商品链接');
    const many = parseProductLink('https://item.jd.com/1.html https://item.jd.com/2.html');
    expect(many.ok).toBe(false);
  });
});

describe('mapCollectedSalesProduct', () => {
  it('safely maps response and cache variant metadata to the full catalog without guessing from skuId', () => {
    const metadata = { version: 1, variants: [
      { id: 'color:1', label: '黑色', color: '黑色', skuIds: ['1234567'], imageUrls: ['https://img13.360buyimg.com/n5/jfs/t1/a.webp'] },
      { id: 'color:2', label: '未知', skuIds: [], imageUrls: ['https://img13.360buyimg.com/n5/jfs/t1/a.webp', 'https://example.com/missing.jpg'] },
    ] };
    const large = 'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp';
    for (const data of [
      { product: { skuId: '1234567', variantMetadata: metadata, mainImages: [large] } },
      { product: { skuId: '1234567', mainImages: [large] }, variantMetadata: metadata },
      { product: { skuId: '1234567', detailUrls: JSON.stringify({ main: [large], variantMetadata: metadata }) } },
    ]) {
      const mapped = mapCollectedSalesProduct(data, '1234567');
      expect(mapped.variantMetadata?.variants.map(item => item.imageUrls)).toEqual([[large], [large]]);
      expect(mapped.variantMetadata?.selectedVariantId).toBeUndefined();
      expect(mapped.variantMetadata?.variants[1].color).toBeUndefined();
    }
    expect(mapCollectedSalesProduct({ product: { variantMetadata: { version: 1, variants: 'bad' } } }, '1234567').variantMetadata).toBeUndefined();
    expect(mapCollectedSalesProduct({ product: { skuId: '1234567' } }, '1234567').variantMetadata).toBeUndefined();
  });

  it('keeps all aliases, unknown-category images and protocol-relative sources', () => {
    const product = mapCollectedSalesProduct({ product: {
      mainImages: ['//cdn.example.com/main.jpg'],
      skuImages: ['https://cdn.example.com/sku.jpg'],
      images: ['https://cdn.example.com/extra.jpg', 'https://cdn.example.com/sku.jpg'],
      detailImages: ['https://cdn.example.com/detail.jpg'],
      descImages: ['https://cdn.example.com/detail2.jpg'],
    } }, '1234567');
    expect(product.imageCatalog.map(({ url, role }) => ({ url, role }))).toEqual([
      { url: 'https://cdn.example.com/main.jpg', role: 'main' },
      { url: 'https://cdn.example.com/extra.jpg', role: 'main' },
      { url: 'https://cdn.example.com/sku.jpg', role: 'sku' },
      { url: 'https://cdn.example.com/detail.jpg', role: 'detail' },
      { url: 'https://cdn.example.com/detail2.jpg', role: 'detail' },
    ]);
  });

  it('preserves all 80 product images', () => {
    const urls = Array.from({ length: 80 }, (_, index) => `https://cdn.example.com/${index}.webp`);
    expect(mapCollectedSalesProduct({ product: { images: urls } }, '1234567').productImages).toEqual(urls);
  });

  it('keeps main images ahead of detail images', () => {
    const product = mapCollectedSalesProduct({
      product: {
        title: '玻色因面霜',
        price: 89,
        brand: '示例',
        category: '美妆护肤',
        props: { 规格: '50ml', 价格: '89元' },
        mainImages: ['https://example.com/main.jpg'],
        skuImages: ['https://example.com/sku.jpg'],
        descImages: ['https://example.com/detail.jpg'],
      },
    }, 'https://item.jd.com/1.html');
    expect(product.productImages).toEqual([
      'https://example.com/main.jpg',
      'https://example.com/sku.jpg',
      'https://example.com/detail.jpg',
    ]);
    expect(product.category).toBe('beauty');
    expect(product.priceLabel).toBe('');
    expect(product.props.价格).toBeUndefined();
    expect(product.sellingPoints).toContain('规格');
    expect(product.sellingPoints).not.toContain('价格');
  });

  it('filters noisy catalog codes and prioritizes real product specs in sellingPoints', () => {
    const product = mapCollectedSalesProduct({
      product: {
        title: '啄木鸟卫衣男',
        brand: '啄木鸟（TUCANO）',
        props: {
          上市时间: '2026年春季',
          厚度: '常规',
          品牌: '啄木鸟（TUCANO）',
          商品分类: '1315',
          商品毛重: '0.660',
          是否可定制: '不可定制',
          材质: '涤纶97%,氨纶3%',
          版型: '标准型',
          穿着方式: '套头',
        },
        mainImages: ['https://example.com/main.jpg'],
      },
    }, '100265837786');
    expect(product.sellingPoints).toContain('材质：涤纶97%,氨纶3%');
    expect(product.sellingPoints).toContain('版型：标准型');
    expect(product.sellingPoints).not.toContain('1315');
    expect(product.sellingPoints).not.toContain('0.660');
    expect(product.sellingPoints).not.toContain('不可定制');
  });
});
