import { describe, expect, it } from 'vitest';
import { salesSubtitlesSrt } from './salesSubtitles';

describe('sales SRT subtitles', () => {
  it('exports real beat times in milliseconds and preserves Chinese text', () => {
    expect(salesSubtitlesSrt([
      { start: 0, end: 0.4, text: '开场' },
      { start: 0.4, end: 5.203, text: '  当前商品细节  ' },
    ])).toBe('1\r\n00:00:00,000 --> 00:00:00,400\r\n开场\r\n\r\n2\r\n00:00:00,400 --> 00:00:05,203\r\n当前商品细节\r\n');
  });
  it('rounds milliseconds across minute and hour boundaries without invalid 1000 fields', () => {
    expect(salesSubtitlesSrt([
      { start: 59.9996, end: 3600.0004, text: '跨越分钟' },
      { start: 3600.0014, end: 3600.0016, text: '毫秒精度' },
    ])).toContain('00:01:00,000 --> 01:00:00,000');
    expect(salesSubtitlesSrt([{ start: 3600.0014, end: 3600.0016, text: '毫秒精度' }]))
      .toContain('01:00:00,001 --> 01:00:00,002');
  });
  it('ignores whitespace, invalid/reversed/zero durations, and collapsed sub-millisecond cues', () => {
    const cues = [
      { start: 0, end: 1, text: ' \n\t ' }, { start: NaN, end: 1, text: '无效' },
      { start: 1, end: Infinity, text: '无效' }, { start: 2, end: 1, text: '倒序' },
      { start: 2, end: 2, text: '零长度' }, { start: 2.0001, end: 2.0002, text: '不足一毫秒' },
      { start: 1e20, end: 2e20, text: '溢出' },
    ];
    expect(salesSubtitlesSrt(cues)).toBe('');
    expect(salesSubtitlesSrt([])).toBe('');
  });
  it('sorts cues without mutating input, normalizes multiline text and keeps gaps and overlaps', () => {
    const cues = [
      { start: 4, end: 5, text: ' 第二段\r\n\r\n补充细节 ' },
      { start: -1, end: 1.5, text: '第一段' },
      { start: 4, end: 6, text: '同时展示' },
    ];
    const srt = salesSubtitlesSrt(cues);
    expect(srt).toBe('1\r\n00:00:00,000 --> 00:00:01,500\r\n第一段\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n第二段\r\n补充细节\r\n\r\n3\r\n00:00:04,000 --> 00:00:06,000\r\n同时展示\r\n');
    expect(cues.map((cue) => cue.start)).toEqual([4, -1, 4]);
  });
});
