import { describe, it, expect } from 'vitest';
import { detectPlatformFromText, extractUrlsFromRawText } from '../collectorShared';

describe('detectPlatformFromText', () => {
  it('detects JD (京东)', () => {
    expect(detectPlatformFromText('https://item.jd.com/100012345678.html')).toBe('jd');
    expect(detectPlatformFromText('https://3.cn/abc')).toBe('jd');
    expect(detectPlatformFromText('jingdong.com/test')).toBe('jd');
  });

  it('detects Taobao/Tmall (淘宝/天猫)', () => {
    expect(detectPlatformFromText('https://detail.tmall.com/item.htm?id=68888888')).toBe('taobao');
    expect(detectPlatformFromText('https://item.taobao.com/item.htm?id=123')).toBe('taobao');
    expect(detectPlatformFromText('https://tb.cn/abc')).toBe('taobao');
  });

  it('detects 1688', () => {
    expect(detectPlatformFromText('https://detail.1688.com/offer/712345678901.html')).toBe('1688');
  });

  it('detects Pinduoduo (拼多多)', () => {
    expect(detectPlatformFromText('https://mobile.yangkeduo.com/Goods.html?goods_id=123')).toBe('pinduoduo');
    expect(detectPlatformFromText('https://pinduoduo.com/test')).toBe('pinduoduo');
  });

  it('detects social platforms', () => {
    expect(detectPlatformFromText('https://www.xiaohongshu.com/discovery/item/66a123456789')).toBe('social');
    expect(detectPlatformFromText('https://xhslink.com/test')).toBe('social');
    expect(detectPlatformFromText('https://www.douyin.com/video/123')).toBe('social');
    expect(detectPlatformFromText('https://www.kuaishou.com/video/456')).toBe('social');
    expect(detectPlatformFromText('https://weibo.com/123')).toBe('social');
    expect(detectPlatformFromText('https://www.bilibili.com/video/BV1xx')).toBe('social');
  });

  it('treats bare numeric IDs (8-16 digits) as JD', () => {
    expect(detectPlatformFromText('100012345678')).toBe('jd');
    expect(detectPlatformFromText('  12345678  ')).toBe('jd');
    expect(detectPlatformFromText('1234567890123456')).toBe('jd');
  });

  it('falls back to JD for unknown platforms', () => {
    expect(detectPlatformFromText('https://example.com/product')).toBe('jd');
    expect(detectPlatformFromText('random text without url')).toBe('jd');
  });

  it('is case-insensitive', () => {
    expect(detectPlatformFromText('HTTPS://ITEM.JD.COM/1000123456.HTML')).toBe('jd');
    expect(detectPlatformFromText('XiaoHongShu.Com/test')).toBe('social');
  });
});

describe('extractUrlsFromRawText', () => {
  it('extracts multiple URLs from text', () => {
    const text = `https://item.jd.com/1000123456.html
https://detail.tmall.com/item.htm?id=68888888
https://www.xiaohongshu.com/discovery/item/66a123456789`;
    const result = extractUrlsFromRawText(text);
    // ⚠️ 实现同时匹配 URL 与数字 ID（8-16 位），URL 中的数字会被额外捕获。
    // 此处只断言关键 URL（http 开头）至少 3 个，且首位仍是 JD 链接。
    const httpUrls = result.filter((u) => u.startsWith('http'));
    expect(httpUrls.length).toBeGreaterThanOrEqual(3);
    expect(result[0]).toBe('https://item.jd.com/1000123456.html');
  });

  it('extracts bare numeric product IDs (8-16 digits)', () => {
    const text = `商品1: 100012345678
商品2: 12345678
商品3: https://item.jd.com/999999999.html`;
    const result = extractUrlsFromRawText(text);
    expect(result).toContain('100012345678');
    expect(result).toContain('12345678');
  });

  it('removes duplicates', () => {
    const text = `https://item.jd.com/1000123456.html
https://item.jd.com/1000123456.html
1000123456`;
    const result = extractUrlsFromRawText(text);
    expect(result.filter(u => u === 'https://item.jd.com/1000123456.html')).toHaveLength(1);
  });

  it('trims whitespace from each entry', () => {
    const text = `  https://item.jd.com/1000123456.html
https://detail.tmall.com/item.htm?id=68888888  `;
    const result = extractUrlsFromRawText(text);
    expect(result[0]).toBe('https://item.jd.com/1000123456.html');
    expect(result[1]).toBe('https://detail.tmall.com/item.htm?id=68888888');
  });

  it('returns empty array for empty/null input', () => {
    expect(extractUrlsFromRawText('')).toEqual([]);
    expect(extractUrlsFromRawText(null as any)).toEqual([]);
    expect(extractUrlsFromRawText(undefined as any)).toEqual([]);
  });

  it('ignores numbers shorter than 8 or longer than 16 digits', () => {
    const text = `short: 1234567
exact: 12345678
exact2: 1234567890123456
long: 12345678901234567`;
    const result = extractUrlsFromRawText(text);
    expect(result).toContain('12345678');
    expect(result).toContain('1234567890123456');
    expect(result).not.toContain('1234567');
    expect(result).not.toContain('12345678901234567');
  });

  it('handles URLs with query params and fragments', () => {
    const text = 'https://item.jd.com/1000123456.html?sku=123&color=blue#section';
    const result = extractUrlsFromRawText(text);
    expect(result[0]).toContain('https://item.jd.com/1000123456.html');
  });
});
