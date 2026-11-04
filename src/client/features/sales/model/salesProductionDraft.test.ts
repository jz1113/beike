import { describe, expect, it } from 'vitest';
import { emptySalesProductionPlan, parseSalesProductionPlan, planForSelectedScript } from './salesProductionDraft';

describe('supported production motion choices', () => {
  it('restores the image-bound visual profile while keeping old drafts and invalid observations empty', () => {
    const personaVisualProfile = { imageUrl: '/main.jpg', presence: 'full_presenter', temperament: '清爽，眉眼舒展',
      gaze: '看向镜头', expression: '嘴角轻提', posture: '肩背自然', limitations: '静态照片' };
    const restored = parseSalesProductionPlan(JSON.parse(JSON.stringify({ personaVisualProfile })));
    expect(restored.personaVisualProfile).toEqual(personaVisualProfile);
    expect(parseSalesProductionPlan({}).personaVisualProfile).toBeNull();
    expect(parseSalesProductionPlan({ personaVisualProfile: { ...personaVisualProfile, imageUrl: '' } }).personaVisualProfile).toBeNull();
  });
  it('starts new production with Wan while retaining explicitly saved model and channel choices', () => {
    expect(emptySalesProductionPlan().videoModel).toBe('wan3.0-video');
    expect(parseSalesProductionPlan({}).videoModel).toBe('wan3.0-video');
    for (const videoModel of ['doubao-seedance-2.0-mini', 'custom-channel']) {
      expect(parseSalesProductionPlan({ videoModel }).videoModel).toBe(videoModel);
      expect(planForSelectedScript(parseSalesProductionPlan({ scriptId: 'old', videoModel }), 'new').videoModel).toBe(videoModel);
    }
  });
  it('round trips an explicit Grok preset without assigning one to existing drafts', () => {
    const plan = parseSalesProductionPlan({ scriptId: 'old', videoVoiceId: ' EVE ' });
    expect(plan.videoVoiceId).toBe('eve');
    expect(planForSelectedScript(plan, 'new').videoVoiceId).toBe('eve');
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan))).videoVoiceId).toBe('eve');
    expect(parseSalesProductionPlan({}).videoVoiceId).toBe('');
  });
  it('defaults Context IR to enabled while preserving an explicit disabled draft through restoration and script changes', () => {
    expect(emptySalesProductionPlan().videoContextIrEnabled).toBe(true);
    expect(parseSalesProductionPlan({}).videoContextIrEnabled).toBe(true);
    expect(parseSalesProductionPlan({ videoContextIrEnabled: 'false' }).videoContextIrEnabled).toBe(true);
    const disabled = parseSalesProductionPlan({ scriptId: 'old', videoContextIrEnabled: false });
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(disabled))).videoContextIrEnabled).toBe(false);
    expect(planForSelectedScript(disabled, 'new').videoContextIrEnabled).toBe(false);
  });

  it.each(['source', 'none', 'manual', 'custom'])('loads legacy %s as script-only without losing edits or finished media', (scriptVideoReference) => {
    const saved = { scriptId: 'script', imitationMode: 'depth_imitation', scriptVideoReference,
      beatActionIds: { 0: 'saved-action' }, generatedVideoUrl: '/finished.mp4', mixedVideoUrl: '/mixed.mp4',
      adaptedBeats: [{ index: 0, subject: '商品', action: '用户编辑的动作', spokenLine: '台词', subtitle: '字幕' }] };
    const plan = parseSalesProductionPlan(saved);
    expect(plan).toMatchObject({ ...saved, imitationMode: 'script_only', scriptVideoReference: 'none' });
    expect(parseSalesProductionPlan(plan)).toEqual(plan);
  });

  it('retains explicit linked-depth selection and does not enable a previously inactive saved depth reference', () => {
    expect(parseSalesProductionPlan({ imitationMode: 'depth_imitation', scriptVideoReference: 'depth' }))
      .toMatchObject({ imitationMode: 'depth_imitation', scriptVideoReference: 'depth' });
    expect(parseSalesProductionPlan({ imitationMode: 'script_only', scriptVideoReference: 'depth' }))
      .toMatchObject({ imitationMode: 'script_only', scriptVideoReference: 'none' });
  });

  it('starts the next script without carrying over manual or linked motion selection', () => {
    const plan = parseSalesProductionPlan({ scriptId: 'old', imitationMode: 'depth_imitation', scriptVideoReference: 'depth', adaptedPromptVersion: 'plan-adapt:old' });
    expect(planForSelectedScript(plan, 'new')).toMatchObject({ scriptId: 'new', imitationMode: 'script_only', scriptVideoReference: 'none', adaptedPromptVersion: '' });
  });

  it.each(['speech', 'voiceover', ''] as const)('carries only an explicitly reusable speech reference into the next script (override=%s)', (voiceModeOverride) => {
    const plan = parseSalesProductionPlan({ scriptId: 'old', voiceId: 'speaker', voiceModeOverride,
      voiceoverAudioUrl: '/voice.mp3', generatedVideoUrl: '/old.mp4', mixedVideoUrl: '/mix.mp4' });
    expect(planForSelectedScript(plan, 'new')).toMatchObject({ scriptId: 'new', voiceId: 'speaker',
      voiceoverAudioUrl: voiceModeOverride === 'speech' ? '/voice.mp3' : '', generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('round trips the actual adaptation prompt version while leaving legacy drafts unverified', () => {
    const plan = parseSalesProductionPlan({ adaptedSourceKey: 'source', adaptedPromptVersion: 'plan-adapt:current' });
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan))).adaptedPromptVersion).toBe('plan-adapt:current');
    expect(parseSalesProductionPlan({ adaptedSourceKey: 'legacy' }).adaptedPromptVersion).toBe('');
  });

  it('round trips independent expression and ending edits, including beats with only performance edits', () => {
    const saved = { adaptedBeats: [
      { index: 0, subject: '', action: '', expression: '抬眼看镜头后浅笑', transition: '笑意回落，保持末姿势', spokenLine: '', subtitle: '' },
      { index: 1, subject: '', action: '举手', expression: '', transition: '', spokenLine: '', subtitle: '' },
    ] };
    const parsed = parseSalesProductionPlan(saved);
    expect(parsed.adaptedBeats).toEqual(saved.adaptedBeats);
    expect(parseSalesProductionPlan(parsed)).toEqual(parsed);
  });

  it('persists explicit empty performance edits and validates their local field markers', () => {
    const plan = parseSalesProductionPlan({ adaptedBeats: [{ index: 0, subject: '', action: '',
      expression: '', transition: '', spokenLine: '', subtitle: '',
      manualPerformanceFields: ['expression', 'transition', 'expression', 'subject', 'unknown', null],
    }] });
    expect(plan.adaptedBeats).toEqual([{ index: 0, subject: '', action: '', expression: '', transition: '',
      spokenLine: '', subtitle: '', manualPerformanceFields: ['expression', 'transition', 'subject'],
    }]);
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it('round trips a cleared subject as an explicit edit instead of dropping an otherwise empty beat', () => {
    const saved = { adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '', manualPerformanceFields: ['subject'] }] };
    expect(parseSalesProductionPlan(saved).adaptedBeats).toEqual(saved.adaptedBeats);
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(parseSalesProductionPlan(saved)))).adaptedBeats).toEqual(saved.adaptedBeats);
  });
});
