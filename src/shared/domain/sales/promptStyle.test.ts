import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt as renderSalesPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { previewSeedancePromptSkeleton } from './scriptPromptPreview';
import { normalizeScriptTemplate } from './scriptTemplate';

const assembleSalesVideoPrompt = (input: Parameters<typeof renderSalesPrompt>[0]) => renderSalesPrompt({
  finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', ...input,
});

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

describe('raw photography facts for an editable final template', () => {
  it('labels current scene and source lighting separately without adding a hidden priority rule', () => {
    const request = input();
    const before = JSON.stringify(request);
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    for (const fact of ['拍摄光线：无阴影棚拍柔光', '机位与运镜：固定机位，无推拉', '摄影质感：保留衣料细纹，背景清楚可辨', '当前场景描述：当前客厅']) expect(prompt).toContain(fact);
    expect(prompt).not.toContain('该图为唯一拍摄空间依据');
    expect(prompt).not.toContain('不为复制原片光线重建原片场景');
    expect(JSON.stringify(request)).toBe(before);
  });

  it('blocks a known excluded entity left in an action without silently rewriting the motion', () => {
    const request = input();
    Object.assign(request.script.shots[0].beats[0], {
      subject: '旧标识人物双手放在{{商品}}下摆', scene: '旧标识人物与背景有亮度差', transition: '旧标识松手后衣料回落',
    });
    request.script.sourceExclusions = [{ type: 'brand_signage', term: '旧标识', replacementRule: '剔除' }];
    const result = assembleSalesVideoPrompt(request);
    expect(result.enginePrompt).toBe('');
    expect(result.templateError).toContain('已排除的原片实体：旧标识');
    expect(request.script.shots[0].beats[0].transition).toBe('旧标识松手后衣料回落');
  });

  it('stops an old physical setting from entering the new scene without rewriting the performance', () => {
    const request = input();
    Object.assign(request.script.shots[0].beats[0], {
      subject: '站在旧服装店试衣帘前的模特', scene: '旧服装店的红色试衣帘前',
      transition: '转向旧服装店的金色门框', expression: '看向旧服装店柜台',
    });
    const result = assembleSalesVideoPrompt(request);
    expect(result.enginePrompt).toBe('');
    expect(result.templateError).toMatch(/镜头1.*动作段1.*服装店/);
    expect(request.script.shots[0].beats[0].transition).toBe('转向旧服装店的金色门框');
  });

  it('records only the linked depth motion reference and matched source time without inventing a style rule', () => {
    const assembled = assembleSalesVideoPrompt({ ...input(), imitationMode: 'depth_imitation', scriptVideoReference: { url: '/reference.mp4', kind: 'depth' } });
    expect(assembled.references.filter((slot) => slot.mediaType === 'video')).toHaveLength(1);
    expect(assembled.enginePrompt).toContain('源片对应时间 00:00 - 00:02.4');
    expect(assembled.enginePrompt).toContain('动作参考：@视频1（深度动作视频），仅取前景动作与接触时序');
    expect(assembled.enginePrompt).not.toContain('原视频同时提供摄影画风参考');
    expect(assembled.enginePrompt).not.toContain('不把深度灰度');
  });

  it.each(['image', 'video'] as const)('excludes an unlinked historical action %s', (mediaType) => {
    const assembled = assembleSalesVideoPrompt({ ...input(), imitationMode: 'depth_imitation',
      actionReferences: { 0: { url: `/pose.${mediaType === 'image' ? 'jpg' : 'mp4'}`, mediaType, label: '普通动作参考' } },
    });
    expect(assembled.references.some((slot) => slot.kind === 'action')).toBe(false);
    expect(assembled.enginePrompt).not.toContain('动作参考：');
    expect(assembled.enginePrompt).not.toContain('深度动作视频');
    expect(assembled.enginePrompt).not.toContain('不从静态图推断');
  });

  it('keeps photography, scene, expression and audio facts independent of the selected depth video', () => {
    const request = input();
    request.script.shots[0].beats[0].expression = '看向镜头后自然垂眼';
    const finalVideoTemplate = '[摄影]{{photographyFacts}}[声音]{{audioFacts}}[素材]{{referenceFacts}}[时间轴]{{timelineFacts}}';
    const render = (url: string) => assembleSalesVideoPrompt({ ...request, finalVideoTemplate,
      imitationMode: 'depth_imitation', scriptVideoReference: { kind: 'depth', url } });
    const before = render('/motion-a.mp4');
    const after = render('/motion-b.mp4');
    expect(after.enginePrompt).toBe(before.enginePrompt);
    expect(after.references.filter((slot) => slot.kind !== 'action')).toEqual(before.references.filter((slot) => slot.kind !== 'action'));
    expect(after.references.find((slot) => slot.kind === 'action')?.url).toBe('/motion-b.mp4');
    for (const fact of ['机位与运镜：固定机位，无推拉', '当前场景描述：当前客厅', '眼神表情：看向镜头后自然垂眼', '视频人声：不生成']) expect(after.enginePrompt).toContain(fact);
    const scriptOnly = assembleSalesVideoPrompt({ ...request, finalVideoTemplate, imitationMode: 'script_only' });
    expect(after.enginePrompt.split('[素材]')[0]).toBe(scriptOnly.enginePrompt.split('[素材]')[0]);
  });

  it('keeps two action beats inside the first true shot in final facts and the data preview', () => {
    const request = input();
    request.script.visualSpec.oneTake = false;
    request.script.durationSec = 8;
    request.script.shots.push({ ...request.script.shots[0], start: 6, end: 8, beats: [{ ...request.script.shots[0].beats[1], start: 6, end: 8 }] });
    const final = assembleSalesVideoPrompt(request).enginePrompt;
    expect(final).toContain('动作段二（00:02.4 - 00:06）');
    expect(final).toContain('镜头二\n\n动作段一（00:06 - 00:08）');
    expect(final).not.toContain('镜头三');
    const preview = previewSeedancePromptSkeleton(request.script);
    expect(preview).toContain('镜头 1·动作段 2（00:02.4 - 00:06）');
    expect(preview).toContain('镜头 2·动作段 1（00:06 - 00:08）');
    expect(preview).not.toContain('镜头 3');
  });

  it('previews the recorded camera and beat details without adding creative direction', () => {
    const preview = previewSeedancePromptSkeleton(input().script);
    for (const fact of ['固定机位，无推拉', '00:02.4', '主体状态：人物双手放在{{商品}}下摆', '人物与背景有亮度差', '松手后衣料回落']) expect(preview).toContain(fact);
    expect(preview).not.toContain('连续运镜');
    expect(preview).not.toContain('不新增');
  });

  it('previews original entities and detail variables as source records without fabricated reference slots', () => {
    const request = input();
    Object.assign(request.script.shots[0].beats[0], {
      subject: '原模特出镜', scene: '原品牌招牌前', transition: '走向原品牌招牌', actionTemplate: '展示旧款裙子的{{商品细节部位}}',
    });
    request.script.sourceExclusions = [
      { type: 'person_appearance', term: '原模特', replacementRule: '替换' },
      { type: 'brand_signage', term: '原品牌招牌', replacementRule: '剔除' },
      { type: 'product', term: '旧款裙子', replacementRule: '替换' },
    ];
    const preview = previewSeedancePromptSkeleton(request.script);
    for (const fact of ['原模特', '原品牌招牌', '旧款裙子', '{{商品细节部位}}', '原片专属元素记录：']) expect(preview).toContain(fact);
    expect(preview).not.toContain('{{Mixed');
    expect(preview).not.toContain('无水印');
  });
});

describe('per-shot setting at submission', () => {
  it.each(['script_only', 'depth_imitation'] as const)('keeps the camera, location and product scoped to the shot in %s', imitationMode => {
    const request = input();
    request.scene = null;
    request.selectedImages = [{ index: 0, url: '/dress.png', role: 'main' }];
    request.script = normalizeScriptTemplate({
      durationSec: 3, visualSpec: { oneTake: false, cameraFeel: '全程前置自拍', lighting: '全程棚灯',
        styleSummary: '全程前置自拍，清透低反差' },
      shots: [
        { beats: [{ start: 0, end: 1, camera: '横移空镜', scene: '影棚窗光', subject: '灯架',
          action: '横移扫过灯架', productVisible: false }] },
        { beats: [{ start: 1, end: 2, camera: '旁观者越肩拍', scene: '咖啡馆窗边', subject: '摄影师背影与女主同框',
          action: '女主侧转', productVisible: true }] },
        { beats: [{ start: 2, end: 3, camera: '前置自拍', scene: '茶室木窗', subject: '女主侧脸',
          action: '举杯微笑', productVisible: false }] },
      ], sourceExclusions: [{ type: 'scene', term: '咖啡馆', replacementRule: '更换场景时替换' }],
    })!;
    const result = assembleSalesVideoPrompt({ ...request, imitationMode, scriptVideoReference: { kind: 'depth', url: '/depth.mp4' } });
    expect(result.templateError).toBe('');
    const prompt = result.enginePrompt;
    expect(prompt).not.toMatch(/全程前置自拍|全程棚灯/);
    const shots = prompt.split(/镜头[一二三]\n/).slice(1);
    expect(shots).toHaveLength(3);
    expect(shots[0]).toContain('本镜场景：影棚窗光');
    expect(shots[0]).not.toContain('重点商品参考');
    expect(shots[1]).toContain('本镜场景：咖啡馆窗边');
    expect(shots[1]).toContain('重点商品参考：@图片1');
    expect(shots[1]).toContain('摄影师背影与女主同框');
    expect(shots[2]).toContain('本镜场景：茶室木窗');
    expect(shots[2]).not.toContain('重点商品参考');
  });

  it('keeps a venue on a monitor from relocating the current set', () => {
    const request = input();
    request.script.sourceExclusions = [{ type: 'scene', term: '咖啡馆', replacementRule: '替换拍摄空间' }];
    request.script.shots[0].beats[0].actionTemplate = '监视器里的人走进咖啡馆';
    const result = assembleSalesVideoPrompt(request);
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).toContain('监视器里的人走进咖啡馆');
  });
});
