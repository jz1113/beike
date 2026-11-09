import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CanvasUnifiedVideoControls,
  CanvasVideoSettings,
  resolveImageModelCapabilities,
  resolveVideoModelCapabilities,
} from './CanvasVideoPlayer';
import { MODEL_CHANNEL_TABS } from '../nodes/CanvasCameraAndPrompts';

describe('canvas H3 channel settings', () => {
  function render(baseUrl: string, quality = '1080P', contextIrEnabled?: boolean) {
    return renderToStaticMarkup(createElement(CanvasVideoSettings, {
      model: 'MiniMax-H3', baseUrl,
      config: { model: 'MiniMax-H3', quality, aspect: '16:9', count: 1, references: [], duration: 30, refMode: 'text', contextIrEnabled },
      onChange: () => {},
    }));
  }

  it('shows the Metaso four resolution tiers and limits every tier to fifteen seconds', () => {
    const html = render('https://metaso.cn/api');
    for (const tier of ['480P', '768P', '1080P', '2K']) expect(html).toContain(`>${tier}</button>`);
    expect(html).toContain('>15s</button>');
    expect(html).not.toContain('>16s</button>');
    expect(html).not.toContain('>30s</button>');
    expect(html).toContain('15 秒');
  });

  it('caps 2K at 15 seconds and keeps other channels within 15', () => {
    expect(render('https://metaso.cn', '2K')).not.toContain('>16s</button>');
    const official = render('https://api.minimax.cn');
    expect(official).not.toContain('>30s</button>');
    expect(official).not.toContain('>480P</button>');
    expect(official).not.toContain('>1080P</button>');
    expect(official).not.toContain('2 倍计费');
  });

  it('shows the saved false Context IR choice without charging text', () => {
    const enabled = render('https://metaso.cn');
    expect(enabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).toContain('checked=""');
    const disabled = render('https://metaso.cn', '1080P', false);
    expect(disabled.match(/<input[^>]+type="checkbox"[^>]*>/)?.[0]).not.toContain('checked');
    expect(disabled).toContain('本次不收取该项费用');
    expect(render('https://api.minimax.cn')).not.toContain('type="checkbox"');
  });
});

describe('model-specific capabilities for video and image nodes', () => {
  it('distinguishes Seedance 2.0 Mini and Seedance 2.5 video capabilities (ratios, resolutions, durations, audio)', () => {
    const mini = resolveVideoModelCapabilities('doubao-seedance-2.0-mini', 'omni', '480P');
    expect(mini.modes.map((m) => m.label)).toEqual(['全能参考', '首帧生视频', '首尾帧', '文生视频', '视频编辑', '视频延长']);
    expect(mini.ratios).toEqual(['adaptive', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3']);
    expect(mini.resolutions).toEqual(['480P', '720P']);
    expect(mini.durations).toEqual(Array.from({ length: 12 }, (_, i) => i + 4));
    expect(mini.customDurationBounds).toBeUndefined();
    expect(mini.supportsAudio).toBe(false);

    const v25 = resolveVideoModelCapabilities('doubao-seedance-2.5', 'omni', '480P');
    expect(v25.modes.map((m) => m.label)).toEqual(['全能参考', '首帧生视频', '首尾帧', '文生视频', '视频编辑', '视频延长']);
    expect(v25.ratios).toEqual(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
    expect(v25.resolutions).toEqual(['480P', '720P', '1080P']);
    expect(v25.durations.at(0)).toBe(4);
    expect(v25.durations.at(-1)).toBe(30);
    expect(v25.customDurationBounds).toEqual({ min: 4, max: 30 });
    expect(v25.supportsAudio).toBe(true);
  });

  it('renders unified video parameter summary button with audio indicator when supported', () => {
    const miniMarkup = renderToStaticMarkup(
      createElement(CanvasUnifiedVideoControls, {
        model: 'doubao-seedance-2.0-mini',
        config: { model: 'doubao-seedance-2.0-mini', quality: '480P', aspect: '9:16', count: 1, references: [], duration: 15, refMode: 'omni', audio: true },
        onChange: () => {},
      }),
    );
    expect(miniMarkup).toContain('全能参考 · 9:16 · 480p · 15s');
    expect(miniMarkup).not.toContain('已开启生成音频');

    const v25Markup = renderToStaticMarkup(
      createElement(CanvasUnifiedVideoControls, {
        model: 'doubao-seedance-2.5',
        config: { model: 'doubao-seedance-2.5', quality: '480P', aspect: '9:16', count: 1, references: [], duration: 30, refMode: 'omni', audio: true },
        onChange: () => {},
      }),
    );
    expect(v25Markup).toContain('全能参考 · 9:16 · 480p · 30s');
    expect(v25Markup).toContain('已开启生成音频');
  });

  it('filters image model capabilities (resolutions, generation quality tiers, background, ratios) by model family', () => {
    const gpt2 = resolveImageModelCapabilities('gpt-image-2');
    expect(gpt2.resolutions.map((r) => r.short)).toEqual(['1K', '2K', '4K', '自定义']);
    expect(gpt2.qualities.map((q) => q.label)).toEqual(['高', '中', '低']);
    expect(gpt2.supportsBackground).toBe(true);

    const gpt25 = resolveImageModelCapabilities('gpt-image-2.5-pro');
    expect(gpt25.qualities.map((q) => q.label)).toEqual(['最高', '极高', '高', '中', '低']);
    expect(gpt25.supportsBackground).toBe(true);

    const banana2 = resolveImageModelCapabilities('nano-banana-2');
    expect(banana2.resolutions.map((r) => r.short)).toEqual(['自动', '512px', '1K', '2K', '4K']);
    expect(banana2.qualities).toEqual([]);
    expect(banana2.supportsBackground).toBe(false);

    const seedream45 = resolveImageModelCapabilities('doubao-seedream-4-5-251128');
    expect(seedream45.resolutions.map((r) => r.short)).toEqual(['2K', '4K']);
    expect(seedream45.qualities).toEqual([]);
    expect(seedream45.supportsBackground).toBe(false);

    const mj = resolveImageModelCapabilities('midjourney');
    expect(mj.resolutions).toEqual([]);
    expect(mj.qualities).toEqual([]);
    expect(mj.supportsBackground).toBe(false);
    expect(MODEL_CHANNEL_TABS).toEqual([
      { id: 'api', label: 'API' },
      { id: 'fal', label: 'Fal' },
    ]);
  });
});
