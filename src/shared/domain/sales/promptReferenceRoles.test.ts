import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

function input(): AssembleSalesPromptInput {
  return {
    // A saved minimal override must receive the same material boundaries.
    finalVideoTemplate: '用户已保存规则\n{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
    model: 'wan3.0-video',
    script: normalizeScriptTemplate({ durationSec: 5, voiceMode: 'none',
      visualSpec: { oneTake: true, lighting: '户外左侧日光' },
      assetSlots: { persona: { required: true, presence: 'full_presenter' } },
      shots: [{ beats: [{ start: 0, end: 5, actionTemplate: '站在原地展示{{商品}}' }] }],
    })!,
    productName: '外套', selectedImages: [{ index: 0, url: '/product-with-street.jpg', role: 'main', view: 'worn' }],
    beatBindings: [], customPersonaFaceUrl: '/person-with-studio.jpg', persona: null,
    scene: { id: 'room', title: '当前客厅', description: '浅色墙面与木地板', lighting: '窗边散射光',
      category: '', spatialType: 'indoor', tags: '', suitableCategories: [], coverUrl: '/selected-room.jpg',
      sourceImages: [], source: 'scene_library' },
  };
}

describe('executable sales material boundaries', () => {
  it('binds the chosen scene as the spatial source even with a previously saved template', () => {
    const request = input();
    const before = JSON.stringify(request);
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.templateError).toBe('');
    expect(assembled.enginePrompt).toContain('用户已保存规则');
    expect(assembled.enginePrompt).toContain('商品用途（@图片2·上身）：仅取款式、颜色、结构和材质及穿着关系');
    expect(assembled.enginePrompt).not.toContain('用途=');
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片1');
    expect(assembled.enginePrompt).toContain('出镜人物（自定义人物）');
    expect(assembled.enginePrompt).not.toContain('仅沿用人物图的可见外貌');
    expect(assembled.enginePrompt).toContain('当前场景参考：@图片3；空间布局、背景与现场光源以此图为准');
    expect(assembled.enginePrompt).toContain('衣物连续性：保持穿着层次与开闭状态');
    expect(assembled.enginePrompt).toContain('随可见操作改变');
    expect(assembled.enginePrompt).toContain('拍摄光线：窗边散射光');
    expect(JSON.stringify(request)).toBe(before);
    expect(assembled.enginePrompt).not.toContain('{{Mixed');
  });

  it('retains current scene text without taking the background or light from product and person images', () => {
    const request = input();
    request.scene = { ...request.scene!, coverUrl: '' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.templateError).toBe('');
    expect(assembled.references.some((slot) => slot.kind === 'scene')).toBe(false);
    expect(assembled.enginePrompt).toContain('当前场景描述：当前客厅；浅色墙面与木地板');
    expect(assembled.enginePrompt).not.toContain('当前场景参考：');
    expect(assembled.enginePrompt).not.toContain('动作参考：');
    expect(assembled.enginePrompt).toContain('拍摄光线：窗边散射光');
    expect(assembled.enginePrompt).not.toContain('户外左侧日光');
  });

  it('isolates the depth reference from identity, spatial and audio sources', () => {
    const assembled = assembleSalesVideoPrompt({ ...input(), imitationMode: 'depth_imitation',
      scriptVideoReference: { kind: 'depth', url: '/depth.mp4' } });
    expect(assembled.enginePrompt).toContain('动作参考：@视频1（深度动作视频），仅取前景动作与接触时序');
    expect(assembled.enginePrompt).toMatch(/动作参考：@视频1[^\n]*时序。/);
    expect(assembled.references.find((slot) => slot.kind === 'action')).toMatchObject({ url: '/depth.mp4', apiToken: '视频1' });
    expect(assembled.audios).toEqual([]);
  });

  it.each(['咖啡杯', '洗衣机', '外套收纳袋', '衣物护理机'])('does not prescribe a clothing layer or zipper state for %s', (productName) => {
    const assembled = assembleSalesVideoPrompt({ ...input(), productName });
    expect(assembled.enginePrompt).not.toContain('衣物连续性：');
    expect(assembled.enginePrompt).toContain('商品用途（@图片2·上身）');
  });

  it('keeps explicitly shared roles without mistaking unmarked product backgrounds for scenes', () => {
    const request = input();
    request.customPersonaFaceUrl = request.selectedImages[0].url;
    request.scene = { ...request.scene!, coverUrl: request.selectedImages[0].url };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references).toHaveLength(1);
    expect(assembled.references[0].roles).toEqual(['persona_face', 'product', 'scene']);
    expect(assembled.enginePrompt).not.toContain('用途=');
    expect(assembled.enginePrompt).toContain('商品用途（@图片1·上身）');
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片1');
    expect(assembled.enginePrompt).toContain('当前场景参考：@图片1');
  });
});
