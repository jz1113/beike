import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SalesScriptImportPanel } from './SalesScriptImportPanel';

vi.mock('../hooks/useSalesSummaryModels', () => ({
  useSalesSummaryModels: () => ({ options: [], model: 'vision-model' }),
}));

describe('reference video import', () => {
  it('offers a way to preserve the unfinished task while keeping the new video selected', () => {
    const props = {
      preferredModel: 'vision-model', onModelChange: vi.fn(),
      video: { name: 'new.mp4', videoUrl: '/new.mp4', videoHash: 'new', durationSec: 10, aspectRatio: '9:16', hasAudio: false },
      busy: '' as const, onUpload: vi.fn(), onClearVideo: vi.fn(), onAnalyze: vi.fn(), onCancel: vi.fn(), onPausePending: vi.fn(),
    };
    const blocked = renderToStaticMarkup(createElement(SalesScriptImportPanel, { ...props, pendingBundle: true }));
    expect(blocked).toContain('new.mp4');
    expect(blocked).toContain('暂存上次进度');
    expect(blocked).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>[\s\S]*?开始拆解/);
    const ready = renderToStaticMarkup(createElement(SalesScriptImportPanel, { ...props, pendingBundle: false }));
    expect(ready).toContain('new.mp4');
    expect(ready).not.toContain('暂存上次进度');
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>[\s\S]*?开始拆解/);
  });

  it('explains that an audio track does not guarantee transcription during analysis', () => {
    const html = renderToStaticMarkup(createElement(SalesScriptImportPanel, {
      preferredModel: 'vision-model', onModelChange: vi.fn(),
      video: { name: 'voice.mp4', videoUrl: '/voice.mp4', videoHash: 'voice', durationSec: 10, aspectRatio: '9:16', hasAudio: true },
      busy: '', onUpload: vi.fn(), onClearVideo: vi.fn(), onAnalyze: vi.fn(), onCancel: vi.fn(), onPausePending: vi.fn(),
    }));
    expect(html).toContain('只分析画面，不读取音轨');
    expect(html).toContain('逐段核对和补录');
  });
});
