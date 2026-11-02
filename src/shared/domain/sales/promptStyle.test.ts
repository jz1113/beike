import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { previewSeedancePromptSkeleton } from './scriptPromptPreview';
import { normalizeScriptTemplate } from './scriptTemplate';

function input(): AssembleSalesPromptInput {
  const script = normalizeScriptTemplate({
    title: '固定机位衣物展示', durationSec: 6, voiceMode: 'none',
    visualSpec: { oneTake: true, styleSummary: '保留衣料细纹，背景清楚可辨', lighting: '左窗侧光，右脸保留阴影', cameraFeel: '固定机位，无推拉' },
    shots: [{ start: 0, end: 6, beats: [
      { start: 0, end: 2.4, subject: '人物双手放在{{商品}}下摆', actionTemplate: '先捏住下摆，再向外拉半掌宽', scene: '人物与背景有亮度差', transition: '松手后衣料回落，承接下一段' },
      { start: 2.4, end: 6, actionTemplate: '保持原地，侧转展示{{商品}}' },
    ] }],
  })!;
  return {
    script, productName: '针织衫', selectedImages: [], beatBindings: [], persona: null,
    scene: { id: 'room', title: '当前客厅', description: '沙发和窗户', lighting: '无阴影棚拍柔光', category: '', spatialType: 'indoor', tags: '', suitableCategories: [], coverUrl: '/room.jpg', sourceImages: [], source: 'scene_library' },
  };
}

describe('reference photography preservation', () => {
  it('keeps reference lighting and a fixed camera when new scene assets are bound', () => {
    const request = input();
    const before = JSON.stringify(request);
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    for (const detail of ['左窗侧光，右脸保留阴影', '固定机位，无推拉', '保留衣料细纹', '当前客厅']) expect(prompt).toContain(detail);
    expect(prompt).toContain('该图为唯一拍摄空间依据');
    expect(prompt).toContain('不为复制原片光线重建原片场景');
    expect(prompt.match(/拍摄空间：沿用 图片1 的同一真实空间/g)).toHaveLength(2);
    for (const invented of ['无阴影棚拍柔光', '连续跟拍', '通过推拉摇移', '商业拍摄空间']) expect(prompt).not.toContain(invented);
    expect(JSON.stringify(request)).toBe(before);
  });

  it('preserves reusable subject, light relationships and transitions when no adaptation exists', () => {
    const request = input();
    request.scene = null;
    Object.assign(request.script.shots[0].beats[0], {
      subject: '旧标识人物双手放在{{商品}}下摆', scene: '旧标识人物与背景有亮度差', transition: '旧标识松手后衣料回落',
    });
    request.script.sourceExclusions = [{ type: 'brand_signage', term: '旧标识', replacementRule: '剔除' }];
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('主体状态：人物双手放在针织衫下摆');
    expect(prompt).toContain('人物与背景有亮度差');
    expect(prompt).toContain('段落衔接：松手后衣料回落');
    expect(prompt).not.toContain('旧标识');
  });

  it.each([true, false])('does not append the original location after a scene swap (adapted: %s)', (adapted) => {
    const request = input();
    Object.assign(request.script.shots[0].beats[0], {
      scene: '旧服装店的红色试衣帘前', transition: '转向旧服装店的金色门框',
    });
    if (adapted) {
      request.script.shots[0].beats[0].subject = '站在旧服装店试衣帘前的模特';
      request.script.shots[0].beats[0].expression = '看向旧服装店柜台';
      request.adaptedBeats = [{ index: 0, subject: '', action: '在当前客厅窗边捏住下摆，松手后原地侧转', spokenLine: '', subtitle: '' }];
    }
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('当前客厅');
    expect(prompt).toContain('左窗侧光，右脸保留阴影');
    expect(prompt).not.toContain('旧服装店');
    expect(prompt).not.toContain('金色门框');
    if (adapted) expect(prompt).toContain('在当前客厅窗边捏住下摆');
  });

  it('uses the scene lighting only when the reference has no lighting record', () => {
    const request = input();
    request.script.visualSpec.lighting = '';
    expect(assembleSalesVideoPrompt(request).enginePrompt).toContain('无阴影棚拍柔光');
    request.scene = null;
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('保持当前环境中一致的光源方向与曝光');
    expect(prompt).not.toContain('自然柔和光线');
  });

  it.each(['depth', 'source'] as const)('gives %s references the appropriate style role', (kind) => {
    const request = input();
    const assembled = assembleSalesVideoPrompt({ ...request, imitationMode: 'depth_imitation', scriptVideoReference: { url: '/reference.mp4', kind } });
    expect(assembled.references.filter((slot) => slot.mediaType === 'video')).toHaveLength(1);
    expect(assembled.enginePrompt).toContain('参照 视频1 在 00:00 - 00:02.4 对应片段');
    expect(assembled.enginePrompt).toContain('动作幅度、起止位置、速度变化、停顿');
    if (kind === 'source') {
      expect(assembled.enginePrompt).toContain('原视频同时提供摄影画风参考');
      expect(assembled.enginePrompt).toContain('不沿用原片人物、商品、字幕、品牌或声音');
      expect(assembled.enginePrompt).not.toContain('深度灰度');
    } else {
      expect(assembled.enginePrompt).toContain('不提供色彩、光线或肤质参考');
      expect(assembled.enginePrompt).not.toContain('原视频同时提供摄影画风参考');
    }
  });

  it.each(['image', 'video'] as const)('does not assume an ordinary action %s contains depth or unseen motion', (mediaType) => {
    const request = input();
    const assembled = assembleSalesVideoPrompt({ ...request, imitationMode: 'depth_imitation',
      actionReferences: { 0: { url: `/pose.${mediaType === 'image' ? 'jpg' : 'mp4'}`, mediaType, label: '普通动作参考' } },
    });
    const prompt = assembled.enginePrompt;
    expect(prompt).not.toContain('深度动作素材');
    expect(prompt).not.toContain('深度灰度');
    expect(prompt).not.toContain('原视频同时提供摄影画风参考');
    if (mediaType === 'image') {
      expect(prompt).toContain('姿态、构图与空间关系');
      expect(prompt).toContain('动作过程和时间节奏以脚本描述为准，不从静态图推断');
      expect(prompt).not.toContain('起止位置、速度变化、停顿');
    } else {
      expect(prompt).toContain('动作幅度、起止位置、速度变化、停顿');
    }
  });

  it('keeps two action beats inside the first true shot in final and preview prompts', () => {
    const request = input();
    request.script.visualSpec.oneTake = false;
    request.script.durationSec = 8;
    request.script.shots.push({ ...request.script.shots[0], start: 6, end: 8, beats: [{ ...request.script.shots[0].beats[1], start: 6, end: 8 }] });
    const final = assembleSalesVideoPrompt(request).enginePrompt;
    expect(final).toContain('镜头一·动作段二（00:02.4 - 00:06）');
    expect(final).toContain('镜头二·动作段一（00:06 - 00:08）');
    expect(final).not.toContain('镜头三');
    const preview = previewSeedancePromptSkeleton(request.script);
    expect(preview).toContain('镜头 1·动作段 2（00:02.4 - 00:06）');
    expect(preview).toContain('镜头 2·动作段 1（00:06 - 00:08）');
    expect(preview).not.toContain('镜头 3');
  });

  it('previews a fixed one-take camera without introducing camera movement or losing beat details', () => {
    const preview = previewSeedancePromptSkeleton(input().script);
    for (const detail of ['固定机位，无推拉', '00:02.4', '主体状态：人物双手放在{{商品}}下摆', '人物与背景有亮度差', '松手后衣料回落']) expect(preview).toContain(detail);
    expect(preview).not.toContain('连续运镜');
  });

  it('cleans every preview field without erasing reusable product detail placeholders', () => {
    const request = input();
    const beat = request.script.shots[0].beats[0];
    Object.assign(beat, { subject: '原模特出镜', scene: '原品牌招牌前', transition: '走向原品牌招牌', actionTemplate: '展示旧款裙子的{{商品细节部位}}' });
    request.script.sourceExclusions = [
      { type: 'person_appearance', term: '原模特', replacementRule: '替换' },
      { type: 'brand_signage', term: '原品牌招牌', replacementRule: '剔除' },
      { type: 'product', term: '旧款裙子', replacementRule: '替换' },
    ];
    const preview = previewSeedancePromptSkeleton(request.script);
    for (const term of ['原模特', '原品牌招牌', '旧款裙子']) expect(preview).not.toContain(term);
    expect(preview).toContain('{{商品细节部位}}');
    expect(preview).toContain('{{Mixed 1}}');
  });
});
