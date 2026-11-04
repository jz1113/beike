import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';
import { parseSalesPersonaVisualProfile, type SalesPersonaVisualProfile } from './personaVisualProfile';

const profile: SalesPersonaVisualProfile = { imageUrl: '/main.jpg', presence: 'full_presenter', temperament: '清爽，眉眼舒展',
  gaze: '目光聚焦镜头', expression: '嘴角轻提', posture: '肩线舒展', limitations: '静态图片不能判断动作速度' };
const script = normalizeScriptTemplate({ durationSec: 3, voiceMode: 'none',
  assetSlots: { persona: { required: true, presence: 'full_presenter' } },
  shots: [{ beats: [{ start: 0, end: 3, action: '举手后回落', expression: '抬眼后浅笑' }] }],
})!;
const input = { script, productName: '针织衫', selectedImages: [], beatBindings: [], scene: null,
  finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
  persona: { id: 'person', name: '当前人物', description: '', tags: '青年女', identityUrl: '/main.jpg', avatarUrl: '/face.jpg',
    faceUrl: '/face.jpg', fullBodyUrl: '/body.jpg', sourceImages: [], hasReferenceImage: true, source: 'persona_library' },
};

describe('image-bound persona visual observations', () => {
  it.each(['script_only', 'depth_imitation'] as const)('carries concrete image observations into a saved %s template while keeping timed expression', imitationMode => {
    const result = assembleSalesVideoPrompt({ ...input, personaVisualProfile: profile, imitationMode,
      ...(imitationMode === 'depth_imitation' ? { scriptVideoReference: { kind: 'depth', url: '/depth.mp4' } } as const : {}),
    });
    expect(result.templateError).toBe('');
    for (const value of [profile.temperament, profile.gaze, profile.expression, profile.posture, profile.limitations]) expect(result.enginePrompt).toContain(value);
    expect(result.enginePrompt).toContain('眼神表情：抬眼后浅笑');
    expect(result.enginePrompt).toContain('人物原始主图：@图片1');
  });

  it('drops old observations after changing the image or visible scope, even when stale draft fields survive', () => {
    const render = (changes: Partial<typeof input>) => assembleSalesVideoPrompt({ ...input, ...changes, personaVisualProfile: profile }).enginePrompt;
    expect(render({ persona: { ...input.persona, identityUrl: '/new-main.jpg' } })).not.toContain(profile.temperament);
    expect(assembleSalesVideoPrompt({ ...input, customPersonaFaceUrl: '/new-face.jpg', personaVisualProfile: profile }).enginePrompt).not.toContain(profile.temperament);
    expect(assembleSalesVideoPrompt({ ...input, customPersonaFaceUrl: '/new-face.jpg', personaVisualProfile: profile }).templateError).toContain('请重新改写分镜');
    for (const presence of ['none', 'hands_only', 'silent_model'] as const) {
      const script = { ...input.script, assetSlots: { ...input.script.assetSlots, persona: { ...input.script.assetSlots.persona, presence } } };
      expect(render({ script })).not.toContain(profile.gaze);
    }
  });

  it('accepts a face-only custom observation without inventing a body', () => {
    const faceProfile = { ...profile, imageUrl: '/custom-face.jpg', posture: '', limitations: '近景未见肩背和重心' };
    const prompt = assembleSalesVideoPrompt({ ...input, customPersonaFaceUrl: faceProfile.imageUrl, personaVisualProfile: faceProfile }).enginePrompt;
    expect(prompt).toContain(`原图视线：${faceProfile.gaze}`);
    expect(prompt).toContain(faceProfile.limitations);
    expect(prompt).not.toContain(`原图姿态：${profile.posture}`);
  });

  it('validates stored profile fields without retaining malformed or unbound observations', () => {
    expect(parseSalesPersonaVisualProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    for (const value of [null, {}, { ...profile, imageUrl: '' }, { ...profile, presence: 'none' }, { ...profile, gaze: 3 },
      { ...profile, temperament: '长'.repeat(601) }, { ...profile, temperament: '', gaze: '', expression: '', posture: '' }]) {
      expect(parseSalesPersonaVisualProfile(value)).toBeNull();
    }
  });

  it('limits hands-only observations to the visible hand posture even if a model supplies facial fields', () => {
    const handProfile = { ...profile, presence: 'hands_only' as const, temperament: '手部放松', posture: '手指舒展' };
    const hands = { ...script, assetSlots: { ...script.assetSlots, persona: { ...script.assetSlots.persona, presence: 'hands_only' as const } } };
    const prompt = assembleSalesVideoPrompt({ ...input, script: hands, personaVisualProfile: handProfile }).enginePrompt;
    expect(prompt).toContain('原图姿态：手指舒展');
    expect(prompt).not.toMatch(/原图视线：|原图表情：/);
  });
});
