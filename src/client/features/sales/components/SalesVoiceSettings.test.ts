import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesBeatVoiceMode, SalesVoiceCandidate } from '@shared/domain/sales';
import { SalesVoiceSettings } from './SalesVoiceSettings';

vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

const voice: SalesVoiceCandidate = {
  id: 'voice-soft', name: '温柔女声', voiceId: 'soft', ttsVoice: 'soft', gender: 'female', tags: ['轻柔', '自然'],
  sampleAudioUrl: '/audio/soft.mp3', promptText: '', source: 'user',
};
const callbacks = { onEditPresentation: () => {}, onOpenMaterials: () => {}, onPatchPlan: () => {} };

describe('production voice settings', () => {
  it.each<SalesBeatVoiceMode>(['speech', 'none'])('does not offer ineffective TTS voice or preview controls for %s', (effectiveVoiceMode) => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode, selectedVoice: voice, rankedVoices: [{ item: voice, score: 10, reasons: [] }], disabled: false,
    }));
    expect(html).toContain('调整介绍方式');
    expect(html).not.toContain('aria-label="选择旁白音色"');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('成片声音策略');
    expect(html).toContain(effectiveVoiceMode === 'speech' ? '声音随视频一同生成' : '当前不生成口播或旁白');
  });

  it('offers the selected narration voice with an on-demand sample', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'voiceover', selectedVoice: voice,
      rankedVoices: [{ item: voice, score: 10, reasons: ['契合生活风格'] }], disabled: false,
    }));
    expect(html).toContain('选择旁白音色');
    expect(html).toContain('温柔女声');
    expect(html).toContain('轻柔 · 自然');
    expect(html).toContain('契合生活风格');
    expect(html).toContain('preload="none"');
    expect(html).toContain('src="/audio/soft.mp3"');
    expect(html).not.toContain('autoplay');
  });

  it('explains an empty voice library and respects production locking', () => {
    const html = renderToStaticMarkup(createElement(SalesVoiceSettings, {
      ...callbacks, effectiveVoiceMode: 'voiceover', selectedVoice: null, rankedVoices: [], disabled: true,
    }));
    expect(html).not.toContain('sales-library-select');
    expect(html).toContain('还没有旁白音色');
    expect(html).toContain('去添加音色');
    const buttons = html.match(/<button\b[^>]*>/g) || [];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.includes('disabled'))).toBe(true);
  });
});
