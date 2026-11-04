import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

function input(): AssembleSalesPromptInput {
  return {
    finalVideoTemplate: '[素材]{{referenceFacts}}[摄影]{{photographyFacts}}[分镜]{{timelineFacts}}[声音]{{audioFacts}}[用户原文结束]',
    model: 'doubao-seedance-2.0-mini', durationSec: 8,
    script: normalizeScriptTemplate({ durationSec: 8, voiceMode: 'speech', visualSpec: {
      oneTake: false, styleSummary: '旧服装店，户外黄昏，暖色调，背景虚化，胶片颗粒，低反差',
      lighting: '原片右侧高位灯光', cameraFeel: '固定机位',
    }, sourceExclusions: [{ type: 'scene', term: '旧服装店', replacementRule: '替换当前场景' }], shots: [
      { summary: '原片商品的广告标题', beats: [
        { start: 0, end: 2, subject: '当前人物正面站立', action: '双手自然搭在{{商品正面结构}}两侧，轻微收拢整理衣襟',
          scene: '旧服装店红色试衣帘', camera: '固定机位', expression: '抬眼，浅笑', transition: '手停在衣襟两侧' },
        { start: 2, end: 4, action: '松开衣襟，双手回落', camera: '固定机位', transition: '维持站位' },
      ] },
      { summary: '原片广告收尾', beats: [{ start: 4, end: 8, action: '侧转身体，手指舒展，手腕自然下垂',
        camera: '缓慢平移', expression: '视线跟随手部', transition: '准备接下一段转身' }] },
    ] })!,
    productName: '当前开衫', productSummary: '不应再发送的商品概括', buyingPoints: ['不应再发送的全量卖点'],
    selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }], beatBindings: [], persona: null,
    scene: { id: 'current', title: '当前客厅', description: '浅色墙面与木地板', lighting: '左窗柔光', spatialType: 'indoor',
      category: '', tags: '', suitableCategories: [], coverUrl: '/room.jpg', sourceImages: [], source: 'scene_library' },
    voice: { id: 'voice', name: '所选女声', voiceId: 'voice-id', ttsVoice: 'voice-id', sampleAudioUrl: '/voice.mp3',
      promptText: '旧的试听句子', tags: [], gender: 'female', source: 'voice_library' },
    adaptedBeats: [
      { index: 0, subject: '', action: '', spokenLine: '领口这里是这样设计的。', subtitle: '领口设计' },
      { index: 1, subject: '', action: '', spokenLine: '放开以后，就自然垂下来了。', subtitle: '自然垂落' },
      { index: 2, subject: '', action: '', spokenLine: '侧面也给你看一下。', subtitle: '侧面展示' },
    ],
  };
}

describe('current sales execution prompt', () => {
  it.each([
    ['none', '只配乐'], ['speech', '轻音乐配口播'], ['voiceover', '预留旁白'],
  ] as const)('selects just the authored opening for %s before inserting the facts', (voiceModeOverride, expected) => {
    const request = input();
    const opening = '【画面质感与参数】\r\n【仅无口播】只配乐\r\n【仅有口播】轻音乐配口播\r\n【仅后期旁白】预留旁白\r\n';
    const result = assembleSalesVideoPrompt({ ...request, voiceModeOverride, finalVideoTemplate: opening + request.finalVideoTemplate });
    expect(result.templateError).toBe('');
    expect(result.enginePrompt.split('[素材]')[0]).toBe(`【画面质感与参数】\r\n${expected}\r\n`);
  });

  it('groups every action under its true shot and preserves camera changes, action, hands and expression', () => {
    const request = input(), before = JSON.stringify(request);
    const result = assembleSalesVideoPrompt(request), prompt = result.enginePrompt;
    expect(result.templateError).toBe('');
    expect(prompt.match(/镜头[一二](?=\n)/g)).toEqual(['镜头一', '镜头二']);
    expect(prompt.match(/^动作段/gm)).toHaveLength(3);
    expect(prompt.indexOf('动作段二')).toBeLessThan(prompt.indexOf('镜头二'));
    for (const text of ['双手自然搭在衣襟两侧，轻微收拢整理衣襟', '松开衣襟，双手回落', '手指舒展，手腕自然下垂', '眼神表情：抬眼，浅笑', '镜头记录：缓慢平移']) expect(prompt).toContain(text);
    expect(prompt.match(/镜头记录：固定机位/g)).toHaveLength(1);
    expect(JSON.stringify(request)).toBe(before);
  });

  it('keeps imported multi-shot data inside one continuous shot when oneTake is explicit', () => {
    const request = input();
    request.script.visualSpec.oneTake = true;
    const before = JSON.stringify(request);
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('镜头数量：1');
    expect(prompt.match(/镜头一（一镜到底）/g)).toHaveLength(1);
    expect(prompt).not.toContain('镜头二');
    expect(prompt.match(/^动作段[一二三]/gm)).toEqual(['动作段一', '动作段二', '动作段三']);
    expect(prompt.indexOf('轻微收拢整理衣襟')).toBeLessThan(prompt.indexOf('松开衣襟，双手回落'));
    expect(prompt.indexOf('松开衣襟，双手回落')).toBeLessThan(prompt.indexOf('侧转身体，手指舒展'));
    expect(prompt).toContain('镜头记录：缓慢平移');
    expect(JSON.stringify(request)).toBe(before);
  });

  it('sends current scene and compatible photographic rendering without source review data or sales-copy pools', () => {
    const prompt = assembleSalesVideoPrompt(input()).enginePrompt;
    for (const text of ['当前场景描述：当前客厅', '浅色墙面与木地板', '拍摄光线：左窗柔光', '暖色调', '背景虚化', '胶片颗粒', '低反差']) expect(prompt).toContain(text);
    for (const text of ['旧服装店', '原片商品', '原片广告', '户外', '黄昏', '原片右侧高位灯光', '原片空间记录', '原词=', '处理记录=', '不应再发送', '未绑定', '未指定']) expect(prompt).not.toContain(text);
    expect(prompt.endsWith('[用户原文结束]')).toBe(true);
  });

  it('removes the actual street/store setting while retaining its rendering properties without requiring exact exclusion text', () => {
    const request = input();
    request.script.visualSpec.styleSummary = '城市街头自然采光，整体色调清透自然，对比度适中。衣物与面部细节清晰，景深较浅，背景门店有轻微虚化。右侧逆光。';
    request.script.sourceExclusions = [{ type: 'scene', term: '某品牌服饰沿街玻璃橱窗大门背景', replacementRule: '改为当前场景' }];
    request.scene!.lighting = '';
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    for (const text of ['整体色调清透自然', '对比度适中', '衣物与面部细节清晰', '景深较浅', '背景有轻微虚化']) expect(prompt).toContain(text);
    for (const text of ['城市街头', '门店', '右侧逆光', '原片右侧高位灯光']) expect(prompt).not.toContain(text);
    expect(prompt).not.toContain('拍摄光线：');
    expect(request.script.visualSpec.styleSummary).toContain('城市街头');
  });

  it.each(['speech', 'voiceover', 'none'] as const)('keeps only the %s mode and places each spoken line once while exporting narration and SRT independently', (voiceModeOverride) => {
    const request = { ...input(), voiceModeOverride }, result = assembleSalesVideoPrompt(request);
    const speaking = voiceModeOverride !== 'none';
    for (const beat of request.adaptedBeats!) expect(result.enginePrompt.split(beat.spokenLine).length - 1).toBe(speaking ? 1 : 0);
    expect(result.narrationText).toBe(speaking ? request.adaptedBeats!.map((beat) => beat.spokenLine).join(' ') : '');
    expect(result.subtitles.map((item) => [item.start, item.end, item.text])).toEqual([[0, 2, '领口设计'], [2, 4, '自然垂落'], [4, 8, '侧面展示']]);
    expect(result.enginePrompt).not.toContain('当前台词文案');
    expect(result.enginePrompt).not.toContain('台词草稿');
    expect(result.enginePrompt).not.toContain('旧的试听句子');
    expect(result.audios).toEqual(voiceModeOverride === 'speech' ? ['/voice.mp3'] : []);
    expect(result.enginePrompt.includes('口播台词：')).toBe(voiceModeOverride === 'speech');
    expect(result.enginePrompt.includes('后期旁白节点：')).toBe(voiceModeOverride === 'voiceover');
    expect(result.enginePrompt.includes('音频1')).toBe(voiceModeOverride === 'speech');
  });

  it.each(['script_only', 'depth_imitation'] as const)('ends a truncated %s plan at the last retained action without changing its expression or earlier continuity', (imitationMode) => {
    const request = { ...input(), imitationMode, scriptVideoReference: { url: '/depth.mp4', kind: 'depth' as const } };
    const original = assembleSalesVideoPrompt(request), truncated = assembleSalesVideoPrompt({ ...request, truncatedEnding: true });
    expect(original.enginePrompt).toContain('准备接下一段转身');
    expect(truncated.enginePrompt).not.toContain('准备接下一段转身');
    for (const text of ['段落衔接：手停在衣襟两侧', '段落衔接：维持站位', '侧转身体，手指舒展，手腕自然下垂', '眼神表情：视线跟随手部']) expect(truncated.enginePrompt).toContain(text);
    expect(truncated.enginePrompt).toContain('本次结尾：已截短，在最后保留动作结束');
    expect(request.script.shots[1].beats[0].transition).toBe('准备接下一段转身');
  });

  it('keeps source costume and scenery observations out of the rendering style', () => {
    const request = input();
    request.script.visualSpec.styleSummary = '竖屏、全身远景，偏游戏动画或三维渲染质感。人物着装以黑色宽松上衣、短裤和厚底长靴为主，浅色长辫形成醒目的动态线条；背景简洁，以蓝色和屋顶栏杆构成。背景为低反差暖色调。';
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('偏游戏动画或三维渲染质感');
    expect(prompt).toContain('背景为低反差暖色调');
    for (const text of ['厚底长靴', '浅色长辫', '屋顶栏杆']) expect(prompt).not.toContain(text);
  });

  it('carries identical states across beats but restates them after a cut', () => {
    const request = input();
    for (const shot of request.script.shots) for (const beat of shot.beats) beat.subject = '正面站立';
    const result = assembleSalesVideoPrompt(request);
    expect(result.enginePrompt.match(/主体状态：正面站立/g)).toHaveLength(2);
    expect(result.enginePrompt.match(/重点商品参考：@图片1/g)).toHaveLength(2);
    expect(result.enginePrompt.match(/^动作描述：/gm)).toHaveLength(3);
  });

  it('blocks an undocumented inner layer even when a detail image is selected', () => {
    const request = input();
    request.script.shots[0].beats[0].actionTemplate = '双手揉捏{{商品内部配件}}，展示内胆回弹';
    request.script.shots[0].beats[1].actionTemplate = '放开内胆，保持站位';
    request.selectedImages = [{ index: 0, url: '/detail.jpg', role: 'detail', view: 'detail' }];
    const result = assembleSalesVideoPrompt(request);
    expect(result.templateError).toMatch(/第 1 段.*内胆.*原始资料未确认/);
    expect(result.enginePrompt).toBe('');
  });

  it.each([
    ['none', '嘴唇开合快速口播'], ['voiceover', '嘴唇开合快速口播'],
    ['none', '嘴唇快速口播讲解'], ['voiceover', '嘴唇快速口播讲解'],
  ] as const)('removes source speaking mouths in %s mode while keeping natural lips and gaze (%s)', (voiceModeOverride, sourceCue) => {
    const request = { ...input(), voiceModeOverride };
    request.script.shots[0].beats[0].expression = `嘴唇轻微分合，抬眼看镜头，${sourceCue}`;
    const result = assembleSalesVideoPrompt(request);
    expect(result.enginePrompt).toContain('嘴唇轻微分合，抬眼看镜头');
    expect(result.enginePrompt).not.toContain(sourceCue);
    expect(result.enginePrompt).toContain('视频人声：不生成');
    expect(result.enginePrompt).toContain('保留自然唇部表情，无连续说话口型');
    expect(result.enginePrompt).not.toContain('本段口播台词的实际发音');
  });
});
