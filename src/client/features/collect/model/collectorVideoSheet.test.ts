import { describe, expect, it } from 'vitest';
import { parseVideoSheet, videoDownloadFilename } from './collectorVideoSheet';

describe('videoDownloadFilename', () => {
  it('keeps a single mp4 extension when the title already ends with one', () => {
    const used = new Set<string>();
    expect(videoDownloadFilename('孩子早上自己主动要喝.mp4', used)).toBe('孩子早上自己主动要喝.mp4');
    expect(videoDownloadFilename('孩子早上自己主动要喝.MP4.mp4', used)).toBe('孩子早上自己主动要喝 (2).mp4');
  });

  it('adds mp4 when the title has no extension and strips windows-illegal characters', () => {
    const used = new Set<string>();
    expect(videoDownloadFilename('新品:宣传?', used)).toBe('新品_宣传_.mp4');
    expect(videoDownloadFilename('con', used)).toBe('_con.mp4');
  });
});

describe('parseVideoSheet', () => {
  it('reads the title and link columns from the sample layout', () => {
    const parsed = parseVideoSheet([
      ['SKU', '新标题', '链接'],
      ['100', '清甜顺口.mp4', 'https://xceshi.oss-cn-beijing.aliyuncs.com/a.mp4'],
      ['101', '没有扩展名', 'https://xceshi.oss-cn-beijing.aliyuncs.com/b'],
      ['102', '跳过', 'not-a-url'],
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.items.map((item) => item.filename)).toEqual(['清甜顺口.mp4', '没有扩展名.mp4']);
  });

  it('reports a missing header', () => {
    expect(parseVideoSheet([['SKU', '备注'], ['1', '无']]).error).toBe('没有找到「标题」和「链接」列');
  });
});
