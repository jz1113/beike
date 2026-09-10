import { describe, it, expect } from 'vitest';
import { fixXhsUrl, keepCollectedUrl, sanitizeCollectedItem } from '../collectorUrlHelpers';

describe('collectorUrlHelpers', () => {
  describe('fixXhsUrl', () => {
    it('将 ci.xiaohongshu.com 替换为 sns-img-hw.xhscdn.com', () => {
      const url = 'https://ci.xiaohongshu.com/spectrum/1040g2sg3101';
      expect(fixXhsUrl(url)).toBe('https://sns-img-hw.xhscdn.com/spectrum/1040g2sg3101');
    });

    it('空链接和其它链接保持原样', () => {
      expect(fixXhsUrl('')).toBe('');
      expect(fixXhsUrl('https://img14.360buyimg.com/n1/s800x800.jpg')).toBe('https://img14.360buyimg.com/n1/s800x800.jpg');
    });
  });

  describe('keepCollectedUrl', () => {
    it('社媒模式支持 http/https CDN 链接', () => {
      expect(keepCollectedUrl('https://sns-img-hw.xhscdn.com/test.jpg', true)).toBe(true);
      expect(keepCollectedUrl('//sns-img-hw.xhscdn.com/test.jpg', true)).toBe(true);
      expect(keepCollectedUrl('', true)).toBe(false);
    });

    it('电商模式过滤垃圾图标和无效图', () => {
      expect(keepCollectedUrl('https://img14.360buyimg.com/n1/s800x800_jfs/t1/123.jpg', false)).toBe(true);
      expect(keepCollectedUrl('https://img14.360buyimg.com/n1/service_ico.png', false)).toBe(false);
      expect(keepCollectedUrl('https://item.jd.com/123456.html', false)).toBe(false);
    });
  });

  describe('sanitizeCollectedItem', () => {
    it('清理合并主图、SKU图与详情图，去重并设置合法封面', () => {
      const raw = {
        platform: 'jd',
        title: '测试商品',
        coverImage: 'https://img14.360buyimg.com/n1/s800x800_jfs/t1/cover.jpg',
        mainImages: ['https://img14.360buyimg.com/n1/s800x800_jfs/t1/cover.jpg', 'https://img14.360buyimg.com/n1/s800x800_jfs/t1/m1.jpg'],
        skuImages: ['https://img14.360buyimg.com/n1/s800x800_jfs/t1/s1.jpg'],
        detailImages: ['https://img14.360buyimg.com/n1/s800x800_jfs/t1/m1.jpg'],
      };

      const result = sanitizeCollectedItem(raw);
      expect(result.images).toHaveLength(3);
      // 封面图自动规范化为高清晰度链接
      expect(result.coverImage).toContain('cover.jpg');
      expect(result.mainImages).toHaveLength(2);
      expect(result.skuImages).toHaveLength(1);
    });
  });
});
