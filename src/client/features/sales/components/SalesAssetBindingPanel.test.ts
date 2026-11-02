import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate, type SalesPersonaCandidate, type SalesSceneCandidate, type SalesVoiceCandidate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { SalesAssetBindingPanel } from './SalesAssetBindingPanel';

vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

const script = normalizeScriptTemplate({
  title: '商品介绍', durationSec: 5,
  assetSlots: { persona: { required: true, presence: 'full_presenter' } },
  shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }],
})!;
const persona: SalesPersonaCandidate = {
  id: 'persona', name: '库中人物', description: '轻松自然', tags: '生活',
  avatarUrl: '/library-avatar.jpg', fullBodyUrl: '/library-body.jpg', faceUrl: '/library-face.jpg',
  sourceImages: [], hasReferenceImage: true, source: 'user',
};
const scene: SalesSceneCandidate = {
  id: 'scene', title: '客厅', description: '自然光客厅', lighting: '自然光', category: '', spatialType: 'indoor',
  tags: '', suitableCategories: [], coverUrl: '/library-scene.jpg', sourceImages: [], source: 'user',
};
const voice: SalesVoiceCandidate = {
  id: 'voice', name: '温柔旁白', voiceId: 'soft', ttsVoice: 'soft', gender: 'female', tags: [],
  sampleAudioUrl: '', promptText: '', source: 'user',
};
const plan = () => ({ ...emptySalesProductionPlan(), personaId: persona.id, sceneId: scene.id });
const props = (): ComponentProps<typeof SalesAssetBindingPanel> => ({
  script, plan: plan(),
  rankedPersonas: [{ item: persona, score: 10, reasons: [] }],
  rankedScenes: [{ item: scene, score: 10, reasons: [] }],
  rankedVoices: [{ item: voice, score: 10, reasons: [] }],
  selectedPersona: persona, selectedScene: scene, selectedVoice: voice, effectiveVoiceMode: 'voiceover', disabled: false,
  onOpenMaterials: () => {}, onSmartMatch: () => {}, onSelectPersona: () => {}, onPatchPlan: () => {},
  onEditPresentation: () => {}, onUploadSlot: () => {},
});
const render = (overrides: Partial<ComponentProps<typeof SalesAssetBindingPanel>> = {}) =>
  renderToStaticMarkup(createElement(SalesAssetBindingPanel, { ...props(), ...overrides }));

describe('production people, scene and sound settings', () => {
  it('offers the three material settings without duplicating product selection or presentation controls', () => {
    const html = render();
    for (const label of ['出镜人物', '拍摄场景', '声音']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('库中人物');
    expect(html).toContain('客厅');
    expect(html).toContain('温柔旁白');
    expect(html).toContain('调整介绍方式');
    for (const label of ['商品图（', '选图/视角', '成片声音策略', 'aria-label="介绍方式"']) expect(html).not.toContain(label);
  });

  it('keeps a single custom body reference separate from retained library identity images', () => {
    const html = render({ plan: { ...plan(), customPersonaBodyUrl: '/custom-body.jpg' } });
    expect(html).toContain('src="/custom-body.jpg"');
    expect(html).toContain('aria-label="上传人脸参考图"');
    for (const url of ['/library-body.jpg', '/library-face.jpg', '/library-avatar.jpg']) expect(html).not.toContain(url);
  });

  it('hides person selection and uploads when the script does not use a presenter', () => {
    const html = render({
      script: { ...script, assetSlots: { ...script.assetSlots, persona: { ...script.assetSlots.persona, required: false, presence: 'none' } } },
      plan: { ...plan(), customPersonaBodyUrl: '/custom-body.jpg', customPersonaFaceUrl: '/custom-face.jpg' },
    });
    expect(html).toContain('当前脚本无需出镜人物');
    for (const label of ['选择出镜人物', '上传全身参考图', '上传人脸参考图', '/custom-body.jpg', '/custom-face.jpg']) expect(html).not.toContain(label);
    expect(html).toContain('上传实景图');
  });

  it('previews a custom scene first and explains that clearing it restores the library scene', () => {
    const custom = render({ plan: { ...plan(), customSceneImageUrl: '/custom-scene.jpg' } });
    expect(custom).toContain('src="/custom-scene.jpg"');
    expect(custom).not.toContain('src="/library-scene.jpg"');
    expect(custom).toContain('清除上传图，恢复素材库场景');
    const restored = render({ plan: { ...plan(), customSceneImageUrl: '' } });
    expect(restored).toContain('src="/library-scene.jpg"');
    expect(restored).not.toContain('清除自定义场景图');
  });

  it('locks material selectors, uploads, clearing and navigation while production is busy', () => {
    const html = render({ disabled: true, plan: { ...plan(), customSceneImageUrl: '/custom-scene.jpg' }, rankedVoices: [], selectedVoice: null });
    const controls = html.match(/<(?:button\b[^>]*|input\b[^>]*type="file"[^>]*)>/g) || [];
    expect(controls.length).toBeGreaterThan(0);
    expect(html).toContain('清除自定义场景图');
    expect(html).toContain('去添加音色');
    expect(controls.every((control) => /\sdisabled(?:=|\s|>)/.test(control))).toBe(true);
  });
});
