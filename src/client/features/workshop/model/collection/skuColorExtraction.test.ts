import { describe, expect, it } from 'vitest';
import { extractProductSkuInfo } from './skuColorExtraction';

describe('extractProductSkuInfo', () => {
  it('extracts color and spec from title segments like in user screenshot', () => {
    const item = {
      itemId: '10227905999823',
      title: '魅族精选I16ProMAX手机2026正品新款手机1TB大内存8800mAh快充长续航双卡5G全网通120Hz 银白灰 官方标配8+128G',
      props: {},
    };
    const info = extractProductSkuInfo(item);
    expect(info.color).toBe('银白灰');
    expect(info.spec).toBe('官方标配8+128G');
  });

  it('prioritizes explicit props when available', () => {
    const item = {
      itemId: '123',
      title: '测试手机 黑色 标配',
      props: {
        机身颜色: '原色钛金属',
        版本: '12+256G',
      },
    };
    const info = extractProductSkuInfo(item);
    expect(info.color).toBe('原色钛金属');
    expect(info.spec).toBe('12+256G');
  });

  it('reads from variantMetadata when matching itemId', () => {
    const item = {
      itemId: 'sku-999',
      title: '时尚女鞋',
      props: {},
      variantMetadata: {
        variants: [
          { skuIds: ['sku-999'], label: '米白色', color: '米白色' },
        ],
      },
    };
    const info = extractProductSkuInfo(item);
    expect(info.color).toBe('米白色');
  });
});
