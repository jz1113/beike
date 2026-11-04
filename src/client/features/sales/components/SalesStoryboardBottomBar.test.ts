import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate, type SalesVoiceCandidate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { SalesStoryboardBottomBar } from './SalesStoryboardBottomBar';

vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
vi.mock('./SalesBottomActionBar', () => ({ SalesDropup: ({ value, children }: { value: ReactNode; children: (close: () => void) => ReactNode }) => createElement('div', null, value, children(() => {})) }));

const script = normalizeScriptTemplate({ durationSec: 5, format: 'product', voiceMode: 'speech', shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
const voice: SalesVoiceCandidate = { id: 'voice', name: '明确选择的人声', voiceId: 'soft', ttsVoice: 'soft', gender: 'female', tags: [], sampleAudioUrl: '/chosen.mp3', promptText: '', source: 'user' };
const props = (): ComponentProps<typeof SalesStoryboardBottomBar> => ({
  scripts: [], activeScript: { id: 'script', title: '商品展示', script, videoUrl: '', videoHash: '', status: 'verified', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' },
  taxonomy: [], selectedScriptId: 'script', loadingScripts: false, category: 'other', audience: 'adult_female',
  plan: { ...emptySalesProductionPlan(), voiceId: voice.id }, effectiveVoiceMode: 'speech',
  rankedPersonas: [], rankedScenes: [], rankedVoices: [{ item: voice, score: 1, reasons: [] }], selectedPersona: null, selectedScene: null, selectedVoice: voice, disabled: false,
  onSelectScript: () => {}, onSelectPersona: () => {}, onPatchPlan: () => {}, onPresentationModeChange: () => {}, onVoiceModeChange: () => {}, onScriptVideoReferenceChange: () => {}, onSmartMatch: () => {}, onUploadSlot: () => {}, onOpenStage: () => {},
});
const render = (overrides: Partial<ComponentProps<typeof SalesStoryboardBottomBar>> = {}) => renderToStaticMarkup(createElement(SalesStoryboardBottomBar, { ...props(), ...overrides }));

describe('storyboard voice selector', () => {
  it('shows Grok presets without claiming to use or preview the inactive library sample', () => {
    const html = render({ plan: { ...props().plan, videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve' }, selectedVoice: null });
    expect(html).toContain('真人口播 · Eve');
    expect(html).toContain('官方预置音色');
    expect(html).not.toContain('请选择人声');
    expect(html).not.toContain('人声已失效');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('所选人声提供口播声音参考');
  });
  it('renders the shared video model settings alongside the storyboard controls before rewriting', () => {
    const html = render({ videoSettings: createElement('button', { 'aria-label': '视频生成模型' }, 'Seedance · 15 秒') });
    expect(html).toContain('aria-label="视频生成模型"');
    expect(html).toContain('Seedance · 15 秒');
    expect(render({ activeScript: null, videoSettings: createElement('span', null, '待选视频模型') })).not.toContain('待选视频模型');
  });

  it.each(['speech', 'voiceover'] as const)('shows the selected voice, selection list and sample for %s', (effectiveVoiceMode) => {
    const html = render({ effectiveVoiceMode });
    expect(html).toContain(`${effectiveVoiceMode === 'speech' ? '真人口播' : '旁白'} · ${voice.name}`);
    expect(html).toContain(`aria-label="${voice.name}试听"`);
    expect(html).toContain('src="/chosen.mp3"');
    expect(html).not.toContain('默认音色');
  });

  it('preserves a missing selection as an explicit error instead of displaying another voice as selected', () => {
    const html = render({ selectedVoice: null, plan: { ...props().plan, voiceId: 'removed' } });
    expect(html).toContain('真人口播 · 人声已失效');
    expect(html).toContain('不会自动更换音色');
    expect(html).not.toContain('<audio');
  });
});
