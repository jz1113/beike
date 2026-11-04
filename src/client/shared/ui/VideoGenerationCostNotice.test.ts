import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VideoGenerationCostNotice } from './VideoGenerationCostNotice';

const render = (duration: number, baseUrl = 'https://metaso.cn/api', model = 'MiniMax-H3', contextIrEnabled?: boolean) => renderToStaticMarkup(
  createElement(VideoGenerationCostNotice, { model, baseUrl, duration, contextIrEnabled }),
);

describe('Metaso H3 generation cost notice', () => {
  it('explains the application cap that avoids the long-output surcharge', () => {
    const html = render(15);
    expect(html).toContain('生成时长限制在 15 秒以内');
    expect(html).not.toContain('当前输出');
    expect(html).toContain('Context IR 已开启，0.05 元/次，按原价单独计费');
  });

  it.each([16, 30])('requires shortening an old %s-second selection instead of submitting it', (duration) => {
    const html = render(duration);
    expect(html).toContain(`当前选择 ${duration} 秒`);
    expect(html).toContain('已超过本应用 15 秒上限，请缩短时长后生成');
    expect(html).toContain('Context IR 已开启，0.05 元/次，按原价单独计费');
    expect(html).not.toMatch(/[¥$]/);
  });

  it.each(['https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.com', ''])('keeps the Metaso rate out of other channels: %s', (baseUrl) => {
    expect(render(30, baseUrl)).toBe('');
  });

  it('does not apply the H3 rule to other Metaso models', () => {
    expect(render(30, 'https://metaso.cn', 'wan3.0-video')).toBe('');
  });

  it('keeps IR Context free when disabled while retaining the fifteen-second cap notice', () => {
    const html = render(30, 'https://metaso.cn/api', 'MiniMax-H3', false);
    expect(html).toContain('Context IR 已关闭，本次不收取该项费用');
    expect(html).not.toContain('0.05 元/次');
    expect(html).toContain('已超过本应用 15 秒上限');
  });
});
