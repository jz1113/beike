import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import type { SalesBeatVoiceMode, SalesVoiceCandidate } from '@shared/domain/sales';
import { SalesVoiceSettings } from './SalesVoiceSettings';

vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

const voice: SalesVoiceCandidate = {
  id: 'voice-soft', name: '温柔女声', voiceId: 'soft', ttsVoice: 'soft', gender: 'female', tags: ['轻柔', '自然'],
  sampleAudioUrl: '/audio/soft.mp3', promptText: '', source: 'user',
};
const callbacks = { onEditPresentation: () => {}, onOpenMaterials: () => {}, onPatchPlan: () => {} };

describe('production voice settings', () => {
  it('offers explicit Grok presets and explains why the saved sample cannot be used', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'speech', selectedVoice: voice, videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve',
      rankedVoices: [{ item: voice, score: 10, reasons: [] }], disabled: true,
    }));
    expect(html).toContain('aria-label="Grok 官方口播音色"');
    expect(html).toContain('<option value="eve" selected="">Eve');
    expect(html).toContain('xAI 合作伙伴权限');
    expect(html).toContain('原声音库选择已保留');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('自动截取');
    expect(html).toContain('<select aria-label="Grok 官方口播音色" disabled=""');
  });
  it('does not offer voice selection or previews for pure visual mode', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'none', selectedVoice: voice, rankedVoices: [{ item: voice, score: 10, reasons: [] }], disabled: false,
    }));
    expect(html).toContain('调整介绍方式');
    expect(html).not.toContain('aria-label="选择旁白音色"');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('成片声音策略');
    expect(html).toContain('当前不生成口播或旁白');
  });

  it.each<SalesBeatVoiceMode>(['speech', 'voiceover'])('offers an explicit voice and an on-demand sample for %s', (effectiveVoiceMode) => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode, selectedVoice: voice,
      rankedVoices: [{ item: voice, score: 10, reasons: ['契合生活风格'] }], disabled: false,
    }));
    expect(html).toContain(effectiveVoiceMode === 'speech' ? '选择口播人声' : '选择旁白人声');
    expect(html).toContain('温柔女声');
    expect(html).toContain('轻柔 · 自然');
    expect(html).toContain('契合生活风格');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('src="/audio/soft.mp3"');
    expect(html).not.toContain('autoplay');
  });

  it('explains an empty voice library and respects production locking', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'voiceover', selectedVoice: null, rankedVoices: [], disabled: true,
    }));
    expect(html).not.toContain('sales-library-select');
    expect(html).toContain('还没有可用人声');
    expect(html).toContain('浏览声音素材');
    const buttons = html.match(/<button\b[^>]*>/g) || [];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.includes('disabled'))).toBe(true);
  });

  it('keeps a missing selected voice explicit and asks for a new choice', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'speech', selectedVoice: null, voiceId: 'removed', rankedVoices: [{ item: voice, score: 10, reasons: [] }], disabled: false,
    }));
    expect(html).toContain('原选人声已不在声音库');
    expect(html).toContain('不会自动更换音色');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('无需单独选择');
  });

  it.each([
    ['vidu-q4-preview', 3, 12, undefined],
    ['doubao-seedance-2.0-mini', 2, 15, 15],
    ['doubao-seedance-2.5', 2, 30, 30],
    ['wan3.0-video', 1, 15, 15],
    ['MiniMax-H3', 2, 15, 15],
  ] as const)('explains submission clipping for %s while preserving the voice-library original', (videoModel, minimum, maximum, total) => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'speech', selectedVoice: voice, videoModel,
      rankedVoices: [{ item: voice, score: 10, reasons: [] }], disabled: false,
    }));
    expect(html).toContain(`参考音频每段 ${minimum}～${maximum} 秒`);
    expect(html).toContain('本地样本超长自动截取提交，声音库原件保留');
    expect(html).toContain(`短于 ${minimum} 秒请换样本`);
    if (total) expect(html).toContain(`合计不超过 ${total} 秒`);
    else expect(html).not.toContain('合计不超过');
    expect(html).toContain('src="/audio/soft.mp3"');
  });

  it('resolves the selected channel to its video model for clipping guidance', () => {
    const store = new Map([[getModalityStorageKey('video'), JSON.stringify([{ id: 'q4-route', modelId: 'viduq4-preview', name: 'Q4渠道' }])]]);
    configureDomainRuntime({ storage: { getItem: (key) => store.get(key) ?? null, setItem: () => {}, removeItem: () => {} } });
    try {
      const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
        ...callbacks, effectiveVoiceMode: 'speech', selectedVoice: voice, videoModel: 'q4-route', rankedVoices: [], disabled: false,
      }));
      expect(html).toContain('参考音频每段 3～12 秒');
    } finally {
      configureDomainRuntime({ storage: null });
    }
  });

  it.each(['voiceover', 'none'] as const)('does not apply video-reference clipping to %s', (effectiveVoiceMode) => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode, selectedVoice: voice, videoModel: 'viduq4-preview', rankedVoices: [], disabled: false,
    }));
    expect(html).not.toContain('自动截取');
  });

  it('does not promise reference clipping for an unsupported video model', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'speech', selectedVoice: voice, videoModel: 'veo3.1', rankedVoices: [], disabled: false,
    }));
    expect(html).not.toContain('自动截取');
  });
});
