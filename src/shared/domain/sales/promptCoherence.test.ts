import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

function input(): AssembleSalesPromptInput {
  return {
    script: normalizeScriptTemplate({ durationSec: 14.8, voiceMode: 'none', visualSpec: {
      oneTake: true, styleSummary: '衣料细纹清楚，纪实摄影', lighting: '左窗柔光', cameraFeel: '固定机位，无推拉',
    }, shots: [{ beats: [
      { start: 0, end: 3.7, action: '抬手触碰{{商品}}衣领', expression: '看向镜头，浅笑后放松', transition: '手留在衣领附近' },
      { start: 3.7, end: 7.4, action: '松开{{商品}}衣领后双手放下', transition: '双手自然垂落' },
      { start: 7.4, end: 11.1, action: '侧转展示{{商品}}轮廓', transition: '保持侧身站位' },
      { start: 11.1, end: 14.8, action: '转回正面展示{{商品}}', transition: '保持末姿势' },
    ] }] })!,
    productName: '连衣裙套装女2026年春夏新款女装小个子穿搭设计感衬衣裙子 L',
    selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }], beatBindings: [],
    persona: { id: 'p', name: '当前人物', description: '', tags: '', identityUrl: '/identity.jpg',
      avatarUrl: '', fullBodyUrl: '', faceUrl: '', sourceImages: ['/identity.jpg'], hasReferenceImage: true, source: 'persona_library' },
    scene: { id: 'room', title: '室内场景3', description: '', lighting: '窗内柔和漫射光', category: '',
      spatialType: 'indoor', tags: '', suitableCategories: [], coverUrl: '/room.jpg', sourceImages: ['/room.jpg'], source: 'scene_library' },
    presentationMode: 'clean_visual', imitationMode: 'depth_imitation', scriptVideoReference: { url: '/depth.mp4', kind: 'depth' },
  };
}

const template = '自定义编辑规则A\n[素材]\n{{referenceFacts}}\n[摄影]\n{{photographyFacts}}\n[时间轴]\n{{timelineFacts}}\n[声音]\n{{audioFacts}}\n[用户结尾]';

describe('editable final sales prompt rendering', () => {
  it('does not restore a source subject that was explicitly cleared in the storyboard', () => {
    const request = input();
    request.script.shots[0].beats[0].subject = '原脚本内胆演示';
    const result = assembleSalesVideoPrompt({ ...request, finalVideoTemplate: template,
      adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '', manualPerformanceFields: ['subject'] }] });
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).not.toContain('原脚本内胆演示');
    expect(result.enginePrompt).toContain('抬手触碰');
  });

  it('renders only the supplied template and data, preserving section order without appending hidden creative rules', () => {
    const request = { ...input(), finalVideoTemplate: template };
    const result = assembleSalesVideoPrompt(request);
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).toMatch(/^自定义编辑规则A\n\[素材\]/);
    expect(result.enginePrompt.endsWith('[用户结尾]')).toBe(true);
    for (const hidden of ['唯一拍摄空间依据', '不把一张参考表情冻结', '不新增连续说话式口型', '不切成参考图片', '深度动作素材仅约束']) expect(result.enginePrompt).not.toContain(hidden);
    expect(result.enginePrompt.indexOf('[素材]')).toBeLessThan(result.enginePrompt.indexOf('[摄影]'));
    expect(result.enginePrompt.indexOf('[摄影]')).toBeLessThan(result.enginePrompt.indexOf('[时间轴]'));
    expect(result.enginePrompt.indexOf('[时间轴]')).toBeLessThan(result.enginePrompt.indexOf('[声音]'));
    expect(result.enginePrompt).not.toContain('{{Mixed');
    expect(result.jimengPrompt).toContain('{{Mixed 1}}');
  });

  it('reflects a template edit literally without merging back an initial system rule', () => {
    const request = input();
    const before = assembleSalesVideoPrompt({ ...request, finalVideoTemplate: template });
    const after = assembleSalesVideoPrompt({ ...request, finalVideoTemplate: template.replace('规则A', '规则B') });
    expect(after.enginePrompt).toBe(before.enginePrompt.replace('规则A', '规则B'));
    expect(after.references).toEqual(before.references);
  });

  it.each([undefined, '', '   '])('does not fall back to an internal creative prompt when the template is %s', (finalVideoTemplate) => {
    const result = assembleSalesVideoPrompt({ ...input(), finalVideoTemplate });
    expect(result.templateError).toContain('提示词管理');
    expect(result.enginePrompt).toBe('');
    expect(result.jimengPrompt).toBe('');
    expect(result.references.map((slot) => slot.kind)).toEqual(['persona_identity', 'product', 'scene', 'action']);
  });

  it.each([
    [template.replace('{{timelineFacts}}', ''), '缺少事实占位符'],
    [template + '\n{{unknownRule}}', '未知占位符'],
    [template + '\n【仅有口播】{{audioFacts}}', '声音模式行'],
    [template + '\n{{constructor}}', '未知占位符'],
    [template + '\n{{#if voice}}', '未知占位符'],
    [template + '\n{{unfinished', '格式无效'],
    [template.replace('{{audioFacts}}', '{{{audioFacts}}}'), '格式无效'],
  ])('rejects an unsupported template before producing a generation prompt', (finalVideoTemplate, expectedError) => {
    const result = assembleSalesVideoPrompt({ ...input(), finalVideoTemplate });
    expect(result.templateError).toContain(expectedError);
    expect(result.enginePrompt).toBe('');
    expect(result.jimengPrompt).toBe('');
  });

  it('rejects unresolved fact slots as data rather than expanding them into template instructions', () => {
    const request = input();
    request.productName = '带{{unknownData}}的商品';
    request.script.visualSpec.styleSummary = '户外黄昏，带有轻微美肤滤镜';
    request.script.shots[0].beats[0].actionTemplate = '在户外抬手触碰{{商品}}衣领，{{audioFacts}}只是输入原文';
    const result = assembleSalesVideoPrompt({ ...request, finalVideoTemplate: template });
    expect(result.templateError).toContain('未展开的占位符');
    expect(result.templateError).toContain('unknownData');
    expect(result.templateError).toContain('audioFacts');
    expect(result.enginePrompt).toBe('');
    expect(result.sanitizedNoiseTerms).toEqual([]);
  });

  it('includes the actual output settings and each matched video interval as data', () => {
    const result = assembleSalesVideoPrompt({ ...input(), finalVideoTemplate: template,
      refMode: 'omni', durationSec: 15, resolution: '480P', aspectRatio: '9:16' });
    for (const fact of ['生成参考方式：素材参考', '生成时长：15 秒', '生成分辨率：480P', '输出画幅：9:16', '镜头数量：1']) expect(result.enginePrompt).toContain(fact);
    for (const interval of ['00:00 - 00:03.7', '00:03.7 - 00:07.4', '00:07.4 - 00:11.1', '00:11.1 - 00:14.8']) expect(result.enginePrompt).toContain(`源片对应时间 ${interval}`);
    expect(result.enginePrompt).toContain('动作参考：@视频1（深度动作视频）');
  });

  it('preserves independently edited SRT metadata without changing the video prompt', () => {
    const request = { ...input(), finalVideoTemplate: template, presentationMode: 'subtitled_intro' as const,
      adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '展示这件商品', subtitle: '原字幕' }] };
    const before = assembleSalesVideoPrompt(request);
    const after = assembleSalesVideoPrompt({ ...request, adaptedBeats: [{ ...request.adaptedBeats[0], subtitle: '只改字幕' }] });
    expect(before.subtitles[0].text).toBe('原字幕');
    expect(after.subtitles[0].text).toBe('只改字幕');
    expect(after.enginePrompt).toBe(before.enginePrompt);
    expect(after.enginePrompt).not.toContain('字幕草稿');
    expect(after.enginePrompt).not.toContain('只改字幕');
  });
});
