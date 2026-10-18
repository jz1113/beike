import { describe, expect, it } from 'vitest';
import { visibleMarkdownText } from './visibleMarkdownText';

describe('visibleMarkdownText', () => {
  it('copies bold labels as the words shown on screen', () => {
    const source = [
      '为了生成类似这张图片的绘图提示词，可以参考以下内容：',
      '',
      '**主体**: 一名年轻男性',
      '**服装**: 黑色宽松T恤，带有白色插肩袖，正面印有反光的文字"LEEFORENB"，搭配黑色运动短裤',
      '**配饰**: 项链，左手佩戴手链，手中拿着一杯冰咖啡',
      '**姿态**: 站立，双手自然垂放，一只手握着饮品',
      '**光线**: 明亮的室内光线',
      '**背景**: 深色沙发和一张简约桌子',
      '',
      '这样的提示词可以帮助生成类似风格的图片。',
    ].join('\n');

    expect(visibleMarkdownText(source)).toBe([
      '为了生成类似这张图片的绘图提示词，可以参考以下内容：',
      '主体: 一名年轻男性',
      '服装: 黑色宽松T恤，带有白色插肩袖，正面印有反光的文字"LEEFORENB"，搭配黑色运动短裤',
      '配饰: 项链，左手佩戴手链，手中拿着一杯冰咖啡',
      '姿态: 站立，双手自然垂放，一只手握着饮品',
      '光线: 明亮的室内光线',
      '背景: 深色沙发和一张简约桌子',
      '这样的提示词可以帮助生成类似风格的图片。',
    ].join('\n'));
  });

  it('drops heading, list, and emphasis marks that the bubble does not show', () => {
    const source = [
      '# 标题',
      '这是 **重点** 和 *斜体*，以及 `代码`。',
      '- 第一项',
      '1. 第二项',
      '> 引用',
    ].join('\n');

    expect(visibleMarkdownText(source)).toBe([
      '标题',
      '这是 重点 和 斜体，以及 代码。',
      '第一项',
      '1 第二项',
      '引用',
    ].join('\n'));
  });

  it('keeps asterisks that a code block actually displays', () => {
    expect(visibleMarkdownText('```\n**主体**: 保持原样\n```')).toBe('**主体**: 保持原样');
  });
});
