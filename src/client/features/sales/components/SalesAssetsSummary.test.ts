import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { SalesAssetsSummary } from './SalesAssetsSummary';

const script: VideoSalesScript = {
  id: 'summary', title: '商品展示', totalDuration: 15, deliveryMode: 'single', shots: [],
  seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
};

describe('sales asset summary', () => {
  it('keeps a missing required picture blocked even when an optional picture is ready', () => {
    const html = renderToStaticMarkup(createElement(SalesAssetsSummary, { script: { ...script, assets: [
      { id: 'required', kind: 'scene', label: '场景', prompt: '', required: true, status: 'failed' },
      { id: 'optional', kind: 'scene', label: '补充', prompt: '', required: false, status: 'done', url: '/optional.jpg', validation: 'passed' },
    ] } }));
    expect(html).toContain('全部必需素材确认后才能继续');
    expect(html).not.toContain('必需素材已具备，可继续确认');
    expect(html).toContain('失败任务');
  });

  it('allows confirmation when required pictures are ready despite an unfinished optional picture', () => {
    const html = renderToStaticMarkup(createElement(SalesAssetsSummary, { script: { ...script, assets: [
      { id: 'required', kind: 'scene', label: '场景', prompt: '', required: true, status: 'done', url: '/required.jpg' },
      { id: 'optional', kind: 'scene', label: '补充', prompt: '', required: false, status: 'failed' },
    ] } }));
    expect(html).toContain('必需素材已具备，可继续确认');
  });
});
