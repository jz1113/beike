import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APPROVED_MODELS } from '@shared/domain/models/modelCatalog';
import { getModelLogoDataUri } from '../ModelIcons';
import ModelPicker from '../model-picker/ModelPicker';
import { VideoGenerationCostNotice } from '../VideoGenerationCostNotice';
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

const renderNotice = (duration: number, baseUrl = 'https://metaso.cn/api', model = 'MiniMax-H3', contextIrEnabled?: boolean) => renderToStaticMarkup(
  createElement(VideoGenerationCostNotice, { model, baseUrl, duration, contextIrEnabled }),
);

describe('Metaso H3 generation cost notice', () => {
  it('explains the application cap that avoids the long-output surcharge', () => {
    const html = renderNotice(15);
    expect(html).toContain('生成时长限制在 15 秒以内');
    expect(html).not.toContain('当前输出');
    expect(html).toContain('Context IR 已开启，0.05 元/次，按原价单独计费');
  });

  it.each([16, 30])('requires shortening an old %s-second selection instead of submitting it', (duration) => {
    const html = renderNotice(duration);
    expect(html).toContain(`当前选择 ${duration} 秒`);
    expect(html).toContain('已超过本应用 15 秒上限，请缩短时长后生成');
    expect(html).toContain('Context IR 已开启，0.05 元/次，按原价单独计费');
    expect(html).not.toMatch(/[¥$]/);
  });

  it.each(['https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.com', ''])('keeps the Metaso rate out of other channels: %s', (baseUrl) => {
    expect(renderNotice(30, baseUrl)).toBe('');
  });

  it('does not apply the H3 rule to other Metaso models', () => {
    expect(renderNotice(30, 'https://metaso.cn', 'wan3.0-video')).toBe('');
  });

  it('keeps IR Context free when disabled while retaining the fifteen-second cap notice', () => {
    const html = renderNotice(30, 'https://metaso.cn/api', 'MiniMax-H3', false);
    expect(html).toContain('Context IR 已关闭，本次不收取该项费用');
    expect(html).not.toContain('0.05 元/次');
    expect(html).toContain('已超过本应用 15 秒上限');
  });
});

describe('model picker selected and list branding', () => {
  it.each([...APPROVED_MODELS, { id: 'unknown-model', name: 'Unknown model' }])('$id uses the same upstream logo in both states', model => {
    const option = { id: 'custom-opaque-route', modelId: model.id, name: model.name };
    const markup = renderToStaticMarkup(createElement(ModelPicker, {
      models: [option], model: option.id, current: option,
      onModelChange: () => {}, effort: 'auto', onEffortChange: () => {},
      open: true, onOpenChange: () => {}, menuRef: createRef<HTMLDivElement>(), showEffort: false,
    }));
    const logo = getModelLogoDataUri(model.id)!;
    expect(markup.split(`src="${logo}"`).length - 1).toBe(2);
    expect(markup).toContain('aria-selected="true"');
  });
});
