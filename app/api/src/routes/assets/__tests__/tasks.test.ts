import { describe, expect, it } from 'vitest';
import { mapTaskSummary, truncatePrompt } from '../tasks';

describe('tasks prompt integrity and summary mapping', () => {
  const longPrompt = '佩戴/使用 @图片1 所示商品；一张 2x2 四宫格无缝拼接买家秀抓拍大图（Full bleed, borderless 2x2 photo collage），展示同一位长相清秀温婉的年轻东亚时尚博主（20多岁东亚年轻女生，深棕色微卷蓬松长发，鹅蛋脸清秀杏眼，白皙通透原生微瑕肤质，松弛甜美）在同一个真实生活场景下的四个不同机位与动作...'.repeat(5);

  const mockTask = {
    id: 'task-123',
    taskId: 'sub-456',
    prompt: longPrompt,
    model: 'nano-fast',
    mediaType: 'image',
    size: '1024x1024',
    quality: 'standard',
    status: 'succeeded',
    resultUrl: 'https://example.com/result.jpg',
    failReason: null,
    createdAt: new Date(),
    product: null,
  };

  it('truncatePrompt truncates text longer than 120 chars with ellipsis', () => {
    expect(truncatePrompt('short prompt')).toBe('short prompt');
    const truncated = truncatePrompt(longPrompt);
    expect(truncated).toBeDefined();
    expect(truncated!.length).toBe(121); // 120 chars + '…'
    expect(truncated!.endsWith('…')).toBe(true);
  });

  it('mapTaskSummary preserves complete long prompt even when fullDetail is false', () => {
    const summary = mapTaskSummary(mockTask, false);
    expect(summary.prompt).toBe(longPrompt);
    expect(summary.prompt.length).toBe(longPrompt.length);
    expect(summary.promptSnippet).toBeDefined();
    expect(summary.promptSnippet!.length).toBe(121);
    expect(summary.promptSnippet!.endsWith('…')).toBe(true);
  });

  it('mapTaskSummary preserves complete long prompt when fullDetail is true', () => {
    const detail = mapTaskSummary(mockTask, true);
    expect(detail.prompt).toBe(longPrompt);
    expect(detail.prompt.length).toBe(longPrompt.length);
  });
});
