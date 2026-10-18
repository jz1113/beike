import { describe, expect, it } from 'vitest';
import { preferredScraperMismatch } from './collectSourceMedia';

describe('preferredScraperMismatch', () => {
  it('lets auto use either ecommerce or social collection', () => {
    expect(preferredScraperMismatch('jd', 'auto')).toBeNull();
    expect(preferredScraperMismatch('social', 'auto')).toBeNull();
  });

  it('keeps wanbang on product links and blocks social links', () => {
    expect(preferredScraperMismatch('taobao', 'wanbang')).toBeNull();
    expect(preferredScraperMismatch('social', 'wanbang')).toContain('万邦只解析电商商品链接');
  });

  it('keeps APIA and Qiyun on social links and blocks product links', () => {
    expect(preferredScraperMismatch('social', 'apia')).toBeNull();
    expect(preferredScraperMismatch('social', 'qiyun')).toBeNull();
    expect(preferredScraperMismatch('1688', 'apia')).toContain('只解析社媒内容');
    expect(preferredScraperMismatch('pinduoduo', 'qiyun')).toContain('只解析社媒内容');
  });
});
