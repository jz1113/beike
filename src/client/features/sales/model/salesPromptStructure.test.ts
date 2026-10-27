import { describe, expect, it } from 'vitest';
import { salesPromptParagraphs, salesPromptSections } from './salesPromptStructure';

describe('sales prompt reading structure', () => {
  it('separates inline headings from legacy prompts without losing text', () => {
    const sections = salesPromptSections('15秒。 【人物与商品参考】图片1衣服。【场景与道具】图片2房间。\n【时间轴与剪辑】0–15秒：原文。');
    expect(sections).toEqual([
      { title: '视频要求', body: '15秒。' }, { title: '人物与商品参考', body: '图片1衣服。' },
      { title: '场景与道具', body: '图片2房间。' }, { title: '时间轴与剪辑', body: '0–15秒：原文。' },
    ]);
  });
  it('supports markdown headings, plain text and empty drafts', () => {
    expect(salesPromptSections('## 拍摄\n完整正文。\n### 声音\n台词。')).toEqual([{ title: '拍摄', body: '完整正文。' }, { title: '声音', body: '台词。' }]);
    expect(salesPromptSections('  完整原文  ')).toEqual([{ title: '视频要求', body: '完整原文' }]);
    expect(salesPromptSections(' \n ')).toEqual([]);
  });
  it('breaks long prose only at sentences and keeps all punctuation and quotes', () => {
    const body = `${'保留商品颜色、版型和人物状态。'.repeat(20)}台词：“这里好看！”图片1。`;
    const paragraphs = salesPromptParagraphs(body);
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.join('')).toBe(body);
    expect(salesPromptParagraphs('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。']);
  });
});
