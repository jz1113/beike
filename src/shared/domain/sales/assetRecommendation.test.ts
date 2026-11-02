import { describe, expect, it } from 'vitest';
import {
  bindBeatProductImages, recommendBgms, recommendPersonas, recommendScenes, recommendVoices,
  type SalesBgmCandidate, type SalesPersonaCandidate, type SalesSceneCandidate, type SalesVoiceCandidate,
} from './assetRecommendation';
import { normalizeScriptTemplate } from './scriptTemplate';

const script = normalizeScriptTemplate({
  title: '法式室内五切镜穿搭',
  durationSec: 9,
  format: 'presenter',
  voiceMode: 'voiceover',
  visualSpec: { aspectRatio: '9:16', oneTake: false, styleSummary: '现代法式松弛感', lighting: '侧逆光', moodTags: ['法式慵懒', '优雅'], pacing: 'slow' },
  assetSlots: {
    productViews: ['front', 'back'],
    persona: { required: true, presence: 'silent_model', anchorsNeeded: ['full_body', 'face'], styleTags: ['穿搭', '时尚'] },
    scene: { spatialType: 'indoor', categoryTags: ['法式', '落地窗'], requiredZones: ['客厅'] },
    audio: { voiceMode: 'voiceover', targetCps: 3.4, voiceTags: ['轻柔', '生活'], bgmRequired: true, bgmMoodTags: ['法式慵懒'] },
  },
  shots: [
    { start: 0, end: 4, summary: '迎面走来', beats: [{ start: 0, end: 4, actionTemplate: '迎面走来', requiredView: 'front' }] },
    { start: 4, end: 9, summary: '转身背部', beats: [{ start: 4, end: 9, actionTemplate: '转身展示背部', requiredView: 'back' }] },
  ],
})!;

describe('sales asset recommendation engine', () => {
  it('ranks dual-anchor fashion personas ahead of missing-image or mismatched personas', () => {
    const personas: SalesPersonaCandidate[] = [
      { id: 'p_tech', name: '子轩', description: '科技数码商务男主播', tags: '科技', avatarUrl: '/m.jpg', fullBodyUrl: '/m.jpg', faceUrl: '/m.jpg', sourceImages: ['/m.jpg'], hasReferenceImage: true, source: 'avatar_preset', defaultVoiceId: 'v_male' },
      { id: 'p_fashion', name: '林夏', description: '法式女装穿搭模特', tags: '穿搭,时尚', avatarUrl: '/face.jpg', fullBodyUrl: '/body.jpg', faceUrl: '/face.jpg', sourceImages: ['/face.jpg', '/body.jpg'], hasReferenceImage: true, source: 'persona_library', defaultVoiceId: 'v_soft' },
    ];
    const ranked = recommendPersonas(script, 'fashion', personas);
    expect(ranked[0].item.id).toBe('p_fashion');
    expect(ranked[0].reasons.join(' ')).toContain('双锚点');
  });

  it('matches indoor French scenes, persona-bound voices, and slow lazy BGMs', () => {
    const scenes: SalesSceneCandidate[] = [
      { id: 's_street', title: '户外商业街', description: '街拍', lighting: '日光', category: '街拍', spatialType: 'outdoor_street', tags: '户外', suitableCategories: ['fashion'], coverUrl: '', sourceImages: [], source: 'builtin_template' },
      { id: 's_french', title: '现代法式客厅', description: '白色落地窗客厅', lighting: '自然侧逆光', category: '法式', spatialType: 'indoor_room', tags: '室内,法式,落地窗', suitableCategories: ['fashion', 'home'], coverUrl: '/room.jpg', sourceImages: ['/room.jpg'], source: 'scene_library' },
    ];
    expect(recommendScenes(script, 'fashion', scenes)[0].item.id).toBe('s_french');

    const persona: SalesPersonaCandidate = { id: 'p1', name: '林夏', description: '女装', tags: '', avatarUrl: '/f.jpg', fullBodyUrl: '/b.jpg', faceUrl: '/f.jpg', sourceImages: [], hasReferenceImage: true, source: 'persona_library', defaultVoiceId: 'v2' };
    const voices: SalesVoiceCandidate[] = [
      { id: 'v1', name: '稳重男声', voiceId: 'm1', ttsVoice: 'male-qn-jingying', gender: 'male', tags: ['沉稳'], sampleAudioUrl: '', promptText: '', source: 'voice_library' },
      { id: 'v2', name: '温柔小暖', voiceId: 'f2', ttsVoice: 'female-tianmei', gender: 'female', tags: ['轻柔', '治愈'], sampleAudioUrl: '', promptText: '', source: 'voice_library' },
    ];
    expect(recommendVoices(script, persona, voices)[0].item.id).toBe('v2');

    const bgms: SalesBgmCandidate[] = [
      { id: 'b_fast', title: '快节奏电子', description: '', moodTags: ['科技'], bpm: 126, durationSec: 12, suitableCategories: ['tech'], license: 'CC0', audioUrl: '/b1' },
      { id: 'b_lazy', title: '法式暖阳', description: '', moodTags: ['法式慵懒', '优雅'], bpm: 86, durationSec: 12, suitableCategories: ['fashion'], license: 'CC0', audioUrl: '/b2' },
    ];
    expect(recommendBgms(script, 'fashion', bgms)[0].item.id).toBe('b_lazy');
  });

  it('binds exact product views per beat and warns on fallback when a view is missing', () => {
    const bindings = bindBeatProductImages(script, [
      { index: 0, url: '/front.jpg', role: 'main', view: 'front' },
      { index: 1, url: '/detail.jpg', role: 'detail', view: 'detail' },
    ]);
    expect(bindings[0]).toMatchObject({ exactViewMatch: true, assignedView: 'front' });
    expect(bindings[1]).toMatchObject({ exactViewMatch: false, image: { url: '/front.jpg' } });
  });

  it('filters and prioritizes personas matching the product age and gender audience', () => {
    const personas: SalesPersonaCandidate[] = [
      { id: 'p_adult_f', name: '林夏', description: '法式女装穿搭模特', tags: '穿搭,时尚', avatarUrl: '/face.jpg', fullBodyUrl: '/body.jpg', faceUrl: '/face.jpg', sourceImages: ['/face.jpg', '/body.jpg'], hasReferenceImage: true, source: 'persona_library' },
      { id: 'p_child_f', name: '朵朵', description: '7岁女童童装模特', tags: '童装,女童', avatarUrl: '/c.jpg', fullBodyUrl: '/c.jpg', faceUrl: '/c.jpg', sourceImages: ['/c.jpg'], hasReferenceImage: true, source: 'persona_library' },
      { id: 'p_senior_f', name: '周阿姨', description: '62岁银发妈妈装模特', tags: '老年,优雅', avatarUrl: '/s.jpg', fullBodyUrl: '/s.jpg', faceUrl: '/s.jpg', sourceImages: ['/s.jpg'], hasReferenceImage: true, source: 'persona_library' },
    ];
    const forChild = recommendPersonas(script, 'fashion', personas, 'child_female');
    expect(forChild[0].item.id).toBe('p_child_f');
    expect(forChild[0].audienceMatched).toBe(true);
    expect(forChild.slice(1).every((entry) => entry.audienceMatched === false)).toBe(true);
  });
});
