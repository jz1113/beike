import { describe, it, expect } from 'vitest';
import { filterParseLinkImages, formatXhsLinksToOnePerLine } from '../xhsLinkBatch';
import { MAX_IMAGES_PER_SET, MIN_IMAGES_PER_SET } from '@beike/domain/assetDeconstruct/prompts';

describe('formatXhsLinksToOnePerLine', () => {
  it('correctly stitches broken newline URLs and normalizes to one per line', () => {
    const brokenInput = `xsec_token=ABhBwVdzIBTrvu1ASF90n5b6ZZfMsTsDMzUNcwc6j1CP8=&xsec_source=pc_user
https://www.xiaohongshu.com/explore/6a8e94b7000000000700415b?
xsec_token=ABMRHUvnalQXdeBRA5mrtwPu3Iy97XAfKK_HGmefbtjgM=&xsec_source=pc_user
https://www.xiaohongshu.com/explore/6a8d4cd000000000170020dd?
xsec_token=ABD0vzw78Yru7wSY0FUO9e0a-acr8MkI5RjYTDTGhau8Q=&xsec_source=pc_user`;

    const result = formatXhsLinksToOnePerLine(brokenInput);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('https://www.xiaohongshu.com/explore/6a8e94b7000000000700415b');
    expect(lines[1]).toBe('https://www.xiaohongshu.com/explore/6a8d4cd000000000170020dd');
  });

  it('extracts links from share text and deduplicates', () => {
    const shareText = `62 嘻嘻发布了一篇小红书笔记，快来看吧！ 😆 http://xhslink.com/a/abc123 复制本条信息打开小红书
http://xhslink.com/a/abc123`;

    const result = formatXhsLinksToOnePerLine(shareText);
    expect(result).toBe('http://xhslink.com/a/abc123');
  });
});

describe('filterParseLinkImages', () => {
  const url = 'https://www.xiaohongshu.com/explore/test';

  it('skips when fewer than MIN_IMAGES_PER_SET images', () => {
    const result = filterParseLinkImages({ images: ['a.jpg', 'b.jpg'] }, url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(MIN_IMAGES_PER_SET));
    }
  });

  it('skips when video is present', () => {
    const result = filterParseLinkImages(
      { images: ['a.jpg', 'b.jpg', 'c.jpg'], video: 'https://video.mp4' },
      url
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('视频');
    }
  });

  it('accepts 3 images as-is', () => {
    const result = filterParseLinkImages({ images: ['a.jpg', 'b.jpg', 'c.jpg'] }, url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.images).toHaveLength(3);
    }
  });

  it('truncates to MAX_IMAGES_PER_SET when more images exist', () => {
    const images = Array.from({ length: 12 }, (_, i) => `img${i + 1}.jpg`);
    const result = filterParseLinkImages({ images }, url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.images).toHaveLength(MAX_IMAGES_PER_SET);
      expect(result.images[0]).toBe('img1.jpg');
      expect(result.images[MAX_IMAGES_PER_SET - 1]).toBe(`img${MAX_IMAGES_PER_SET}.jpg`);
    }
  });
});
