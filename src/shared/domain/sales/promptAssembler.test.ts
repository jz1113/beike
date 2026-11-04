import { describe, expect, it } from 'vitest';
import { bindBeatProductImages } from './assetRecommendation';
import { eligibleSalesImages } from './imageSelection';
import { assembleSalesVideoPrompt as renderSalesPrompt } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

const assembleSalesVideoPrompt = (input: Parameters<typeof renderSalesPrompt>[0]) => renderSalesPrompt({
  finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', ...input,
});

describe('sales final video prompt assembler', () => {
  it.each([true, false])('includes every selected product image even when only the primary is bound (bindings: %s)', (withBindings) => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [
      { start: 0, end: 2.5, action: '展示商品', requiredView: 'worn' },
      { start: 2.5, end: 5, action: '展示细节', requiredView: 'worn' },
    ] }] })!;
    const catalog = [
      { index: 0, url: '/primary.jpg', role: 'main' as const },
      { index: 1, url: '/supplement.jpg', role: 'main' as const },
      { index: 2, url: '/unselected.jpg', role: 'main' as const },
    ];
    const selectedImages = eligibleSalesImages(catalog, { colorLabel: '', confirmedImageUrls: ['/primary.jpg', '/supplement.jpg'], excludedImageUrls: [] });
    const beatBindings = withBindings ? bindBeatProductImages(script, selectedImages) : [];
    if (withBindings) expect(beatBindings.map((binding) => binding.image?.url)).toEqual(['/primary.jpg', '/primary.jpg']);
    const assembled = assembleSalesVideoPrompt({ script, productName: '针织衫', selectedImages, beatBindings, persona: null, scene: null });
    expect(assembled.references.map((slot) => [slot.url, slot.apiToken, slot.kind])).toEqual([
      ['/primary.jpg', '图片1', 'product'], ['/supplement.jpg', '图片2', 'product'],
    ]);
    expect(assembled.enginePrompt).toContain('商品用途（@图片1、@图片2）');
    expect(assembled.enginePrompt.match(/重点商品参考：@图片1/g)).toHaveLength(1);
    expect(assembled.jimengPrompt).toContain('{{Mixed 2}}');
  });

  it('keeps product reference order and deduplication while a beat focuses on the second selected image', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品', requiredView: 'front' }] }] })!;
    const selectedImages = [
      { index: 0, url: '/supplement.jpg', role: 'main' as const },
      { index: 1, url: '/front.jpg', role: 'main' as const, view: 'front' as const },
      { index: 2, url: '/supplement.jpg', role: 'detail' as const },
    ];
    const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages,
      beatBindings: bindBeatProductImages(script, selectedImages), persona: null, scene: null });
    expect(assembled.references.map((slot) => slot.url)).toEqual(['/supplement.jpg', '/front.jpg']);
    expect(assembled.enginePrompt).toContain('商品用途（@图片1、@图片2·正面）');
    expect(assembled.enginePrompt).toContain('重点商品参考：@图片2');
  });

  it.each([['16:9', '输出画幅：16:9'], ['adaptive', '输出画幅：adaptive']])('aligns automatic prompts with the selected output ratio %s', (aspectRatio, expected) => {
    const script = normalizeScriptTemplate({ durationSec: 5, visualSpec: { aspectRatio: '9:16' }, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    const assembled = assembleSalesVideoPrompt({ script, aspectRatio, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null });
    expect(assembled.enginePrompt).toContain(expected);
    expect(assembled.enginePrompt).not.toContain('9:16 画幅');
  });

  it('assembles Mixed 1..5 slots for body, face, front/back product, and scene with Engine 图片1..5 parity', () => {
    const script = normalizeScriptTemplate({
      title: '法式室内穿搭展示',
      durationSec: 8,
      format: 'presenter',
      voiceMode: 'voiceover',
      visualSpec: { aspectRatio: '9:16', oneTake: false, styleSummary: '现代生活方式Vlog风格', lighting: '自然柔和侧逆光', moodTags: ['时尚', '优雅'] },
      shots: [
        { start: 0, end: 3, summary: '迎面走来，自信随性', beats: [{ start: 0, end: 3, shotSize: '全景过渡到中景', camera: '缓慢后退跟随', actionTemplate: '挎着黑色菱格纹链条包走向镜头展示{{商品}}', expression: '淡淡微笑', requiredView: 'front' }] },
        { start: 3, end: 8, summary: '灵动转身，背部设计', beats: [{ start: 3, end: 8, shotSize: '中景', camera: '小幅环绕', actionTemplate: '优美转身展示{{商品}}背部剪裁', expression: '眉眼灵动', requiredView: 'back' }] },
      ],
      sourceExclusions: [{ type: 'accessory', term: '黑色菱格纹链条包', replacementRule: '剔除' }],
    })!;
    const selectedImages = [
      { index: 0, url: '/prod-front.jpg', role: 'main' as const, view: 'front' as const },
      { index: 3, url: '/prod-back.jpg', role: 'detail' as const, view: 'back' as const },
    ];
    const beatBindings = bindBeatProductImages(script, selectedImages);
    const assembled = assembleSalesVideoPrompt({
      script,
      productName: '法式亚麻镂空连衣裙',
      selectedImages,
      beatBindings,
      adaptedBeats: [
        { index: 0, subject: '模特身穿亚麻连衣裙', action: '从白色玻璃门前轻盈走向镜头，展示裙摆垂坠感', expression: '淡淡微笑', transition: '停步承接下一段', spokenLine: '这条亚麻连衣裙上身自带呼吸感', subtitle: '自带呼吸感' },
        { index: 1, subject: '转身展示背部镂空', action: '停步轻抚发丝后优美转身，展现背部镂空剪裁', expression: '眉眼灵动', transition: '保持转身后的站位', spokenLine: '转身背后的系带剪裁更是点睛之笔', subtitle: '背部系带剪裁' },
      ],
      persona: {
        id: 'p1', name: '知夏', description: '气质女模', tags: '法式',
        avatarUrl: '/face.jpg', fullBodyUrl: '/body.jpg', faceUrl: '/face.jpg',
        sourceImages: ['/body.jpg', '/face.jpg'], hasReferenceImage: true, source: 'persona_library',
      },
      scene: {
        id: 's1', title: '法式复古客厅', description: '木地板与拱形门窗', lighting: '午后自然光',
        category: '时尚', spatialType: 'indoor_room', tags: '客厅', suitableCategories: ['fashion'],
        coverUrl: '/scene.jpg', sourceImages: ['/scene.jpg'], source: 'scene_library',
      },
    });

    expect(assembled.references.map((r) => [r.mixedToken, r.apiToken, r.kind])).toEqual([
      ['{{Mixed 1}}', '图片1', 'persona_body'],
      ['{{Mixed 2}}', '图片2', 'persona_face'],
      ['{{Mixed 3}}', '图片3', 'product'],
      ['{{Mixed 4}}', '图片4', 'product'],
      ['{{Mixed 5}}', '图片5', 'scene'],
    ]);
    expect(assembled.jimengPrompt).toContain('{{Mixed 1}}');
    expect(assembled.jimengPrompt).toContain('{{Mixed 5}}');
    expect(assembled.enginePrompt).toContain('@图片1');
    expect(assembled.enginePrompt).toContain('@图片5');
    expect(assembled.enginePrompt).not.toContain('{{Mixed');
    expect(assembled.jimengPrompt).not.toContain('黑色菱格纹链条包');
    expect(assembled.narrationText).toContain('自带呼吸感');
    expect(assembled.subtitles).toHaveLength(2);
    expect(assembled.warnings).toEqual([]);
  });

  it('numbers depth video action references separately from image slots', () => {
    const script = normalizeScriptTemplate({ title: '单段展示', durationSec: 5, shots: [{ start: 0, end: 5, beats: [{ start: 0, end: 5, actionTemplate: '展示{{商品}}' }] }] })!;
    const images = [{ index: 0, url: '/prod.jpg', role: 'main' as const }];
    const assembled = assembleSalesVideoPrompt({
      script,
      productName: '针织开衫',
      selectedImages: images,
      beatBindings: bindBeatProductImages(script, images),
      scriptVideoReference: { url: '/depth.mp4', kind: 'depth' },
      imitationMode: 'depth_imitation',
      persona: null,
      scene: null,
    });
    expect(assembled.references.map((r) => [r.mixedToken, r.apiToken, r.kind, r.mediaType])).toEqual([
      ['{{Mixed 1}}', '图片1', 'product', 'image'],
      ['{{Mixed 2}}', '视频1', 'action', 'video'],
    ]);
    expect(assembled.jimengPrompt).toContain('动作参考：{{Mixed 2}}（深度动作视频）');
    expect(assembled.enginePrompt).toContain('动作参考：@视频1（深度动作视频）');
    expect(assembled.enginePrompt).toContain('仅取前景动作与接触时序');
  });

  it('retains raw size and price facts for the editable template while keeping clean_visual audio metadata', () => {
    const script = normalizeScriptTemplate({
      title: '纯展示脚本',
      durationSec: 6,
      shots: [{ start: 0, end: 6, beats: [{ start: 0, end: 6, actionTemplate: '展示{{商品}}，到手价￥299，尺码表衣长62' }] }],
    })!;
    const images = [{ index: 0, url: '/prod.jpg', role: 'main' as const }];
    const assembled = assembleSalesVideoPrompt({
      script,
      productName: '咖啡条针织衫',
      selectedImages: images,
      beatBindings: bindBeatProductImages(script, images),
      adaptedBeats: [{ index: 0, subject: '模特穿搭 SKU:102330', action: '转身展示咖啡条针织衫，到手价￥299', spokenLine: '不该出现的口播', subtitle: '不该出现的字幕' }],
      presentationMode: 'clean_visual',
      imitationMode: 'depth_imitation',
      persona: null,
      scene: null,
    });
    expect(assembled.effectiveVoiceMode).toBe('none');
    expect(assembled.narrationText).toBe('');
    expect(assembled.subtitles).toEqual([]);
    expect(assembled.jimengPrompt).toContain('到手价￥299');
    expect(assembled.jimengPrompt).toContain('SKU:102330');
    expect(assembled.sanitizedNoiseTerms).toEqual([]);
    expect(assembled.warnings.some((w) => w.includes('关联深度视频尚未就绪'))).toBe(true);
  });

  it('keeps fractional timing without including source review titles or exclusion records', () => {
    const script = normalizeScriptTemplate({
      title: '短动作展示', durationSec: 5.2,
      visualSpec: { moodTags: ['旧牌专属风格'], lighting: '旧牌专属光线', cameraFeel: '经过旧牌专属招牌' },
      sourceExclusions: [{ type: 'brand_signage', term: '旧牌专属', replacementRule: '剔除' }],
      shots: [{ start: 0, end: 5.2, summary: '旧牌专属展示', beats: [
        { start: 0, end: 0.4, actionTemplate: '举起{{商品}}', camera: '固定机位', expression: '看向镜头微笑' },
        { start: 0.4, end: 5.2, actionTemplate: '展示{{商品}}细节' },
      ] }],
    })!;
    const images = [{ index: 0, url: '/prod.jpg', role: 'main' as const }];
    const assembled = assembleSalesVideoPrompt({ script, productName: '当前商品', selectedImages: images,
      beatBindings: bindBeatProductImages(script, images), persona: null, scene: null });
    expect(assembled.jimengPrompt).toContain('00:00 - 00:00.4');
    expect(assembled.enginePrompt).toContain('00:00.4 - 00:05.2');
    expect(assembled.jimengPrompt).not.toContain('旧牌专属');
    expect(assembled.sanitizedNoiseTerms).toEqual([]);
    expect(assembled.jimengPrompt).not.toContain('原词=');
  });
});

describe('sales motion mode isolation', () => {
  it('uses one linked depth video across beats with matching source timestamps', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [
      { start: 0, end: 2.5, action: '走近商品' }, { start: 2.5, end: 5, action: '展示商品' },
    ] }] })!;
    const assembled = assembleSalesVideoPrompt({ script, productName: '当前商品', selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }],
      beatBindings: [], persona: null, scene: null, imitationMode: 'depth_imitation',
      scriptVideoReference: { url: '/linked.mp4', kind: 'depth' },
      actionReferences: { 0: { url: '/old-action.mp4', mediaType: 'video', label: '旧动作' } },
    });
    expect(assembled.references.filter((slot) => slot.mediaType === 'video')).toEqual([
      expect.objectContaining({ url: '/linked.mp4', apiToken: '视频1', kind: 'action' }),
    ]);
    expect(assembled.enginePrompt).toContain('源片对应时间 00:00 - 00:02.5');
    expect(assembled.enginePrompt).toContain('源片对应时间 00:02.5 - 00:05');
    expect(assembled.references.some((slot) => slot.url === '/old-action.mp4')).toBe(false);
    expect(assembled.enginePrompt).toContain('动作参考：@视频1（深度动作视频）');
  });

  it('ignores a linked video in script and image mode', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null,
      imitationMode: 'script_only', scriptVideoReference: { url: '/linked.mp4', kind: 'depth' } });
    expect(assembled.references).toEqual([]);
    expect(assembled.enginePrompt).not.toContain('动作参考：');
    expect(assembled.enginePrompt).not.toContain('源片对应时间');
  });

  it('keeps saved depth bindings out of script-only requests and restores them when depth mode returns', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    const input = { script, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null,
      actionReferences: { 0: { url: '/old-action.mp4', mediaType: 'video' as const, label: '旧动作' } },
      scriptVideoReference: { url: '/saved-depth.mp4', kind: 'depth' as const } };
    const scriptOnly = assembleSalesVideoPrompt({ ...input, imitationMode: 'script_only' });
    expect(scriptOnly.references.some((slot) => slot.kind === 'action')).toBe(false);
    expect(scriptOnly.enginePrompt).not.toContain('动作参考：');
    const depth = assembleSalesVideoPrompt({ ...input, imitationMode: 'depth_imitation' });
    expect(depth.references.find((slot) => slot.kind === 'action')?.url).toBe('/saved-depth.mp4');
    expect(depth.enginePrompt).toContain('动作参考');
  });

  it.each(['script_only', 'depth_imitation'] as const)('excludes historical pose images in %s mode without mutating their bindings', (imitationMode) => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '叉腰站立展示商品' }] }] })!;
    const images = [{ index: 0, url: '/prod.jpg', role: 'main' as const }];
    const actionReferences = { 0: { url: '/atlas-pose-diagonal.jpg', mediaType: 'image' as const, label: '片段 1 动作参考（叉腰站姿）' } };
    const assembled = assembleSalesVideoPrompt({
      script,
      productName: '修身风衣',
      selectedImages: images,
      beatBindings: bindBeatProductImages(script, images),
      actionReferences,
      imitationMode,
      persona: null,
      scene: null,
    });
    expect(assembled.references.map((r) => [r.mixedToken, r.apiToken, r.kind, r.mediaType])).toEqual([
      ['{{Mixed 1}}', '图片1', 'product', 'image'],
    ]);
    expect(assembled.enginePrompt).not.toContain('动作参考：');
    expect(actionReferences[0].url).toBe('/atlas-pose-diagonal.jpg');
  });

  it('rejects source-video and per-beat fallbacks when the linked depth video is unavailable', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null,
      imitationMode: 'depth_imitation', scriptVideoReference: { url: '/source.mp4', kind: 'source' },
      actionReferences: { 0: { url: '/old-action.mp4', mediaType: 'video', label: '历史动作' } },
    });
    expect(assembled.references).toEqual([]);
    expect(assembled.enginePrompt).not.toContain('视频1');
    expect(assembled.warnings).toContain('脚本关联深度视频尚未就绪，请回素材库继续处理，或切换为「仅按脚本」。');
  });
});

describe('custom scene references', () => {
  it('uses an uploaded scene without silently keeping the old library scene name and lighting', () => {
    const script = normalizeScriptTemplate({ durationSec: 5, visualSpec: { lighting: '柔和光线' }, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [], beatBindings: [], persona: null,
      scene: { id: 'old', title: '旧室内影棚', description: '旧场景', lighting: '旧紫色霓虹灯', category: '', spatialType: 'studio', tags: '', suitableCategories: [], coverUrl: '/old-scene.jpg', sourceImages: [], source: 'scene_library' },
      customSceneImageUrl: '/uploaded-outdoor.jpg' });
    expect(assembled.references.find((slot) => slot.kind === 'scene')).toMatchObject({ url: '/uploaded-outdoor.jpg', label: '场景参考（自定义实景）' });
    expect(assembled.enginePrompt).toContain('当前场景参考：@图片1');
    expect(assembled.enginePrompt).not.toContain('旧室内影棚');
    expect(assembled.enginePrompt).not.toContain('旧紫色霓虹灯');
    expect(assembled.enginePrompt).not.toContain('柔和光线');
  });
});
