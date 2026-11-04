import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';
import type { SalesVoiceCandidate } from './assetRecommendation';

const voice: SalesVoiceCandidate = { id: 'warm', name: '温暖女声', voiceId: 'warm-id', ttsVoice: 'warm-id',
  gender: 'female', tags: ['温暖', '自然'], sampleAudioUrl: '/storage/local/voice.mp3', promptText: '清楚自然的普通话', source: 'voice_library' };
const input = {
  finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
  script: normalizeScriptTemplate({ durationSec: 5, voiceMode: 'speech', shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!,
  productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null,
  adaptedBeats: [{ index: 0, subject: '人物', action: '展示商品', spokenLine: '这件穿着很舒服', subtitle: '' }],
};

describe('selected sales voice input', () => {
  it('requires an explicit Grok preset and preserves the library sample without submitting it', () => {
    const request = { ...input, model: 'grok-imagine-video-1.5', voice, voiceAudioUrl: '/saved-reference.mp3' };
    expect(assembleSalesVideoPrompt(request)).toMatchObject({ audios: [], voiceError: expect.stringContaining('请选择 Grok 官方预置音色') });
    const result = assembleSalesVideoPrompt({ ...request, videoVoiceId: 'eve' });
    expect(result).toMatchObject({ audios: [], voiceIds: ['eve'], voiceError: '' });
    expect(result.enginePrompt).toContain('当前人声名称：Grok Eve');
    expect(result.enginePrompt).toContain('<AUDIO_0>');
    expect(result.enginePrompt).not.toContain('温暖女声');
    expect(result.enginePrompt).not.toContain('音频1');
    expect(assembleSalesVideoPrompt({ ...request, voice: null, videoVoiceId: 'eve' }).voiceError).toBe('');
    expect(assembleSalesVideoPrompt({ ...request, videoVoiceId: 'not-a-preset' }).voiceError).toContain('请选择');
    expect(assembleSalesVideoPrompt({ ...request, videoVoiceId: 'eve', voiceModeOverride: 'voiceover' })).not.toHaveProperty('voiceIds');
    expect(assembleSalesVideoPrompt({ ...request, videoVoiceId: 'eve', presentationMode: 'clean_visual' })).not.toHaveProperty('voiceIds');
  });
  it.each(['script_only', 'depth_imitation'] as const)('binds the selected voice sample and audio token in %s mode', (imitationMode) => {
    const result = assembleSalesVideoPrompt({ ...input, imitationMode, voice, voiceAudioUrl: '/generated-default.mp3' });
    expect(result.voiceError).toBe('');
    expect(result.audios).toEqual([voice.sampleAudioUrl]);
    expect(result.enginePrompt).toContain('当前人声名称：温暖女声');
    expect(result.enginePrompt).not.toContain('当前人声说明：');
    expect(result.enginePrompt).not.toContain(voice.promptText);
    expect(result.enginePrompt).not.toContain('当前人声标签：');
    expect(result.enginePrompt).toContain('当前人声参考：@音频1');
    expect(result.enginePrompt).toContain('说话韵律与自然停顿');
    expect(result.enginePrompt).toContain('样本原句不作为本片台词');
    expect(result.enginePrompt).toContain('口播台词：“这件穿着很舒服”');
    expect(result.references.some((slot) => slot.url === voice.sampleAudioUrl)).toBe(false);
  });

  it('does not treat the audition text as voice instructions or new dialogue', () => {
    const result = assembleSalesVideoPrompt({ ...input, voice: { ...voice, promptText: '这是一段与商品无关的试听稿，快来购买吧。' } });
    expect(result.enginePrompt).not.toContain('与商品无关的试听稿');
    expect(result.enginePrompt).toContain('口播台词：“这件穿着很舒服”');
    expect(result.narrationText).toBe('这件穿着很舒服');
  });

  it('keeps visual expression and action while removing source speech speed and articulation', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, voiceMode: 'speech', visualSpec: {
      pacing: 'fast', styleSummary: '纪实摄影，快速口播', cameraFeel: '固定机位，语速很快',
    }, shots: [{ beats: [{ start: 0, end: 5, action: '快速口播并举手展示商品',
      expression: '抬眼看镜头，嘴唇快速开合说话，嘴角轻扬，头部轻点，语气高亢',
      transition: '保持站位并全程闭嘴',
    }] }] })!;
    const result = assembleSalesVideoPrompt({ ...input, script, voice,
      adaptedBeats: [{ ...input.adaptedBeats[0], action: '', subject: '' }] });
    for (const visible of ['抬眼看镜头', '嘴角轻扬', '头部轻点', '保持站位', '举手展示商品', '固定机位']) expect(result.enginePrompt).toContain(visible);
    for (const sourceCue of ['快速口播', '嘴唇快速开合', '语气高亢', '语速很快', '全程闭嘴']) expect(result.enginePrompt).not.toContain(sourceCue);
    expect(result.enginePrompt).toContain('画面动作节奏（不作为口播语速）：较快');
  });

  it('preserves non-speaking mouth expressions and joined hand gestures', () => {
    const request = { ...input, voice, adaptedBeats: [{ ...input.adaptedBeats[0],
      action: '双手并拢后展开；手臂回落。', expression: '嘴唇轻微分合，嘴角轻扬；双手并拢，嘴唇快速开合说话',
    }] };
    const result = assembleSalesVideoPrompt(request);
    expect(result.enginePrompt).toContain('双手并拢后展开；手臂回落。');
    expect(result.enginePrompt).toContain('嘴唇轻微分合');
    expect(result.enginePrompt).toContain('嘴角轻扬');
    expect(result.enginePrompt).toContain('双手并拢');
    expect(result.enginePrompt).not.toContain('嘴唇快速开合说话');
  });

  it.each([
    ['微笑、眼神热切注视镜头，嘴唇开合快速口播，随后短暂垂视衣襟并迅速抬眼看镜头。', ['微笑、眼神热切注视镜头', '短暂垂视衣襟并迅速抬眼看镜头'], ['嘴唇开合快速口播']],
    ['低头关注手部揉捏动作，嘴唇快速口播讲解，随后微抬视线看镜头。', ['低头关注手部揉捏动作', '微抬视线看镜头'], ['嘴唇快速口播讲解']],
    ['挑眉、自信微笑，直视镜头，说话节奏轻快有力。', ['挑眉、自信微笑', '直视镜头'], ['说话节奏轻快有力']],
    ['嘴唇轻抿后抬眼看镜头，手部继续揉捏商品。', ['嘴唇轻抿后抬眼看镜头', '手部继续揉捏商品'], []],
  ])('retains the visible performance from the generated failure case: %s', (expression, retained, removed) => {
    const result = assembleSalesVideoPrompt({ ...input, voice, adaptedBeats: [{ ...input.adaptedBeats[0], expression }] });
    for (const text of retained) expect(result.enginePrompt).toContain(text);
    for (const text of removed) expect(result.enginePrompt).not.toContain(text);
  });

  it('keeps the full collar-adjusting action after removing speech modifiers', () => {
    const action = '模特面向镜头，双手自然搭在{{商品正面结构}}两侧，随口播轻微向中间收拢整理衣襟，身体随说话轻微摆动。';
    const result = assembleSalesVideoPrompt({ ...input, voice, productName: '春夏新品女装开衫女宽松显瘦透气百搭针织外套',
      adaptedBeats: [{ ...input.adaptedBeats[0], action }] });
    expect(result.enginePrompt).toContain('动作描述：模特面向镜头，双手自然搭在衣襟两侧，轻微向中间收拢整理衣襟，身体轻微摆动。');
    expect(result.enginePrompt).not.toContain('随口播');
    expect(result.enginePrompt).not.toContain('随说话');
    expect(result.enginePrompt).toContain('当前商品名称：春夏新品女装开衫女宽松显瘦透气百搭针织外套');
  });

  it('keeps unrecognized action wording in a clause that also contains a speech modifier', () => {
    const result = assembleSalesVideoPrompt({ ...input, voice, adaptedBeats: [{ ...input.adaptedBeats[0],
      action: '随口播轻叩桌沿并掀起包装，再随说话缓缓掰开边缘。',
    }] });
    expect(result.enginePrompt).toContain('动作描述：轻叩桌沿并掀起包装，再缓缓掰开边缘。');
  });

  it('uses an explicitly synthesized reference for a voice with only a TTS identifier', () => {
    const result = assembleSalesVideoPrompt({ ...input, voice: { ...voice, sampleAudioUrl: '' }, voiceAudioUrl: '/synthesized.mp3' });
    expect(result.audios).toEqual(['/synthesized.mp3']);
    expect(result.voiceError).toBe('');
  });

  it('blocks missing selection, missing dialogue, and missing speech audio separately', () => {
    expect(assembleSalesVideoPrompt(input).voiceError).toContain('请先选择');
    expect(assembleSalesVideoPrompt({ ...input, voice, adaptedBeats: [] }).voiceError).toContain('分镜台词');
    expect(assembleSalesVideoPrompt({ ...input, voice: { ...voice, sampleAudioUrl: '' } }).voiceError).toContain('音色参考音频');
  });

  it('keeps voiceover audio out of video inputs and does not invalidate its visual prompt when the narrator changes', () => {
    const request = { ...input, voiceModeOverride: 'voiceover' as const, voiceAudioUrl: '/narration.mp3' };
    const result = assembleSalesVideoPrompt({ ...request, voice });
    const changed = assembleSalesVideoPrompt({ ...request, voice: { ...voice, name: '另一旁白', sampleAudioUrl: '/another.mp3' } });
    expect(result.audios).toEqual([]);
    expect(result.voiceError).toBe('');
    expect(result.enginePrompt).not.toContain('音频1');
    expect(changed.enginePrompt).toBe(result.enginePrompt);
    expect(assembleSalesVideoPrompt({ ...request, voice: { ...voice, voiceId: '', ttsVoice: '' } }).voiceError).toContain('合成音色编号');
  });

  it('ignores all saved voice choices and audio when producing clean visuals', () => {
    const result = assembleSalesVideoPrompt({ ...input, voice, voiceAudioUrl: '/old-voice.mp3', presentationMode: 'clean_visual' });
    expect(result.effectiveVoiceMode).toBe('none');
    expect(result.voiceError).toBe('');
    expect(result.audios).toEqual([]);
    expect(result.enginePrompt).not.toContain('音频1');
    expect(result.enginePrompt).not.toContain(voice.name);
  });
});
