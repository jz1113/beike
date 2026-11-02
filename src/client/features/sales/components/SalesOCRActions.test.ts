import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptySalesCollection } from '../model/salesCollectionDraft';
import { SalesOCRActions } from './SalesOCRActions';
import type { SalesOCRProps } from './salesOCRTypes';

const result = { engine: 'test', width: 100, height: 100, text: '棉', lines: [], cached: false };
const state = { ...emptySalesCollection(), imageCatalog: [{ index: 0, url: '/text', role: 'detail' as const }], ocrImageUrls: ['/text'] };
const noop = () => {};
function render(patch: Partial<SalesOCRProps> = {}) {
  return renderToStaticMarkup(createElement(SalesOCRActions, { state, disabled: false, onRecognize: noop, onCancel: noop, progress: null, onRetryFailed: noop, ...patch }));
}
const recognized = { ...state, ocrImages: [{ imageUrl: '/text', editedText: '棉', result }] };

describe('OCR action in the shared product bar', () => {
  it('offers recognition only while the queue needs processing', () => {
    expect(render()).toContain('识别文字');
    expect(render({ state: recognized })).toBe('');
    const mixed = { ...recognized, imageCatalog: [...state.imageCatalog, { index: 1, url: '/pending', role: 'detail' as const }], ocrImageUrls: ['/text', '/pending'] };
    expect(render({ state: mixed })).toContain('继续识别');
    expect(render({ state: { ...recognized, ocrImages: [{ ...recognized.ocrImages[0], editedText: '用户修正的棉含量' }] } })).toBe('');
  });
  it('prevents repeat recognition while keeping stop available', () => {
    const running = render({ disabled: true, progress: { current: 1, total: 1, completed: 0, succeeded: 0, failed: 0, imageUrl: '/text' } });
    expect(running).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?识别中<\/button>/);
    expect(running).toContain('停止识别');
    const stopButton = [...running.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , text]) => text.includes('停止识别'));
    expect(stopButton?.[1]).not.toContain('disabled=""');
  });
  it('offers retry after failure without introducing confirmation or navigation actions', () => {
    expect(render({ state: { ...state, ocrImages: [{ imageUrl: '/text', editedText: '', error: '失败' }] } })).toContain('重试识别');
    for (const html of [render(), render({ state: recognized })]) {
      for (const label of ['确认收录', '整理卖点', '编辑分镜', '<footer']) expect(html).not.toContain(label);
    }
  });
  it('does not offer recognition for unavailable originals or blank completed results', () => {
    expect(render({ state: { ...recognized, imageCatalog: [{ ...state.imageCatalog[0], unavailable: true }] } })).toBe('');
    expect(render({ state: { ...recognized, ocrImages: [{ ...recognized.ocrImages[0], editedText: '' }] } })).toBe('');
  });
});
