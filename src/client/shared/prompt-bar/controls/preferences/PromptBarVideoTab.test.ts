import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getVideoModelById } from '@shared/domain/media/video';
import { imageQualityLabel, promptRewriteStrengthLabel } from './PromptBarImageTab';
import { PromptBarVideoTab } from './PromptBarVideoTab';

function render(baseUrl: string, resolution: string, duration: number, contextIrEnabled?: boolean) {
  const profile = getVideoModelById('MiniMax-H3', baseUrl)!;
  return renderToStaticMarkup(createElement(PromptBarVideoTab, {
    modelId: 'MiniMax-H3', baseUrl, supportedResolutions: profile.supportedResolutions,
    mode: 'text', aspect: '16:9', resolution, duration,
    contextIrEnabled, onContextIrEnabled: () => {},
    onMode: () => {}, onAspect: () => {}, onResolution: () => {}, onDuration: () => {},
  }));
}

describe('H3 video parameter controls', () => {
  it('shows Metaso distinct tiers and caps even a saved 30-second duration at fifteen seconds', () => {
    const html = render('https://metaso.cn/api', '1080P', 30);
    for (const tier of ['480P', '768P', '1080P', '2K']) expect(html).toContain(`title="${tier}"`);
    expect(html).toContain('aria-valuemax="15"');
    expect(html).toContain('aria-valuenow="15"');
    expect(html).toContain('已超过本应用 15 秒上限');
  });

  it('limits 2K to 15 seconds without applying Metaso tiers to official channels', () => {
    expect(render('https://metaso.cn', '2K', 15)).toContain('aria-valuemax="15"');
    const html = render('https://api.minimax.cn', '1080P', 15);
    expect(html).toContain('aria-valuemax="15"');
    expect(html).not.toContain('title="480P"');
    expect(html).not.toContain('title="1080P"');
    expect(html).not.toContain('2 倍计费');
  });

  it('defaults the Metaso Context IR checkbox on and keeps explicit false off', () => {
    const enabled = render('https://metaso.cn', '1080P', 15);
    expect(enabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).toContain('checked=""');
    expect(enabled).toContain('IR Context 优化素材理解与提示词表达');
    const disabled = render('https://metaso.cn', '1080P', 15, false);
    expect(disabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).not.toContain('checked');
    expect(disabled).toContain('本次不收取该项费用');
    expect(render('https://ai.comfly.org', '1080P', 15)).not.toContain('type="checkbox"');
  });
});

describe('image tier labels', () => {
  it('labels gpt quality and qwen prompt rewriting', () => {
    expect(imageQualityLabel('low')).toBe('Low');
    expect(imageQualityLabel('medium')).toBe('Medium');
    expect(imageQualityLabel('high')).toBe('High');
    expect(imageQualityLabel('')).toBe('High');
    expect(promptRewriteStrengthLabel('low')).toBe('不改写');
    expect(promptRewriteStrengthLabel('medium')).toBe('改写');
    expect(promptRewriteStrengthLabel('high')).toBe('改写+思考');
    expect(promptRewriteStrengthLabel('xhigh')).toBe('改写+思考');
    expect(promptRewriteStrengthLabel('max')).toBe('改写+思考');
  });
});
