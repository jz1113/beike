import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt as renderSalesPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

const assembleSalesVideoPrompt = (input: Parameters<typeof renderSalesPrompt>[0]) => renderSalesPrompt({
  finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', ...input,
});

function input(): AssembleSalesPromptInput {
  return {
    script: normalizeScriptTemplate({ title: '人物展示', durationSec: 5,
      assetSlots: { persona: { required: true, presence: 'full_presenter' } },
      shots: [{ beats: [{ start: 0, end: 5, actionTemplate: '人物展示{{商品}}' }] }],
    })!,
    productName: '连衣裙', selectedImages: [{ index: 0, url: '/product-model.jpg', role: 'main', view: 'worn' }],
    beatBindings: [], scene: null,
    persona: { id: 'old', name: '旧库人物', description: '', tags: '', avatarUrl: '/old-avatar.jpg', fullBodyUrl: '/old-body.jpg', faceUrl: '/old-face.jpg', sourceImages: [], hasReferenceImage: true, source: 'persona_library' },
  };
}

describe('sales video identity facts', () => {
  it.each(['script_only', 'depth_imitation'] as const)('keeps current temperament separate from source performance in %s, including custom identity isolation', (imitationMode) => {
    const request = input();
    request.persona = { ...request.persona!, description: '肩背舒展，神态从容', tags: '清冷、自信' };
    request.script.assetSlots.persona.styleTags = ['明快、有表现力'];
    request.script.shots[0].beats[0].expression = '抬眼看镜头，停顿后嘴角微扬';
    const render = (customPersonaFaceUrl?: string) => assembleSalesVideoPrompt({ ...request, imitationMode, customPersonaFaceUrl,
      ...(imitationMode === 'depth_imitation' ? { scriptVideoReference: { kind: 'depth', url: '/depth.mp4' } } as const : {}),
    });
    const prompt = render().enginePrompt;
    expect(prompt).toContain('人物设定：肩背舒展，神态从容');
    expect(prompt).toContain('人物风格标签：清冷、自信');
    expect(prompt).toContain('原分镜人物风格（仅表演参考）：明快、有表现力');
    expect(prompt).toContain('眼神表情：抬眼看镜头，停顿后嘴角微扬');
    const custom = render('/custom-face.jpg').enginePrompt;
    expect(custom).not.toMatch(/清冷、自信|肩背舒展，神态从容|旧库人物/);
    expect(custom).toContain('原分镜人物风格（仅表演参考）：明快、有表现力');
  });

  it.each([
    { customPersonaBodyUrl: '/new-body.jpg' },
    { customPersonaFaceUrl: '/new-face.jpg' },
    { customPersonaBodyUrl: '/new-body.jpg', customPersonaFaceUrl: '/new-face.jpg' },
  ])('isolates custom references from stale library identity: %j', (custom) => {
    const assembled = assembleSalesVideoPrompt({ ...input(), ...custom });
    expect(assembled.references.filter((slot) => slot.kind.startsWith('persona')).map((slot) => slot.url)).toEqual(Object.values(custom));
    expect(assembled.enginePrompt).toContain('（自定义人物）');
    expect(assembled.enginePrompt).not.toContain('旧库人物');
    expect(assembled.references.some((slot) => slot.url.startsWith('/old-'))).toBe(false);
  });

  it('lists body and face as distinct facts without inventing a priority instruction', () => {
    const assembled = assembleSalesVideoPrompt(input());
    expect(assembled.references.slice(0, 3).map((slot) => [slot.kind, slot.apiToken, slot.url])).toEqual([
      ['persona_body', '图片1', '/old-body.jpg'], ['persona_face', '图片2', '/old-face.jpg'], ['product', '图片3', '/product-model.jpg'],
    ]);
    expect(assembled.enginePrompt).toContain('人物主体参考：@图片1');
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片2');
    expect(assembled.enginePrompt).not.toContain('为唯一依据');
    expect(assembled.enginePrompt).not.toContain('不混合成另一张脸');
  });

  it('represents an avatar-only asset without pretending it supplies a body', () => {
    const request = input();
    request.persona = { ...request.persona!, fullBodyUrl: '', faceUrl: '' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references[0]).toMatchObject({ kind: 'persona_face', url: '/old-avatar.jpg' });
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片1');
    expect(assembled.enginePrompt).not.toContain('人物主体参考：');
  });

  it('does not submit a leftover persona selection outside the explicit product-only scope', () => {
    const request = input();
    request.script.assetSlots.persona = { ...request.script.assetSlots.persona, required: false, presence: 'none' };
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/new-face.jpg' });
    expect(assembled.references.every((slot) => !slot.kind.startsWith('persona'))).toBe(true);
    expect(assembled.enginePrompt).toContain('出镜范围：仅商品');
    expect(assembled.enginePrompt).not.toContain('人物名称：');
    expect(assembled.enginePrompt).not.toContain('不新增模特');
  });

  it('submits only the hand reference for a hands-only scope', () => {
    const request = input();
    request.script.assetSlots.persona.presence = 'hands_only';
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references.some((slot) => slot.kind === 'persona_face')).toBe(false);
    expect(assembled.references[0]).toMatchObject({ url: '/old-body.jpg', label: '手部形象（旧库人物）' });
    expect(assembled.enginePrompt).toContain('出镜范围：仅手部');
    expect(assembled.enginePrompt).not.toContain('人物人脸参考：');
    expect(assembled.enginePrompt).not.toContain('五官比例');
  });

  it('still binds an explicitly chosen face when the presenter reference is optional', () => {
    const request = input();
    request.script.assetSlots.persona.required = false;
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/chosen-face.jpg' });
    expect(assembled.references[0]).toMatchObject({ kind: 'persona_face', url: '/chosen-face.jpg' });
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片1');
  });

  it('keeps a shared person/product URL singular and records both explicit roles', () => {
    const assembled = assembleSalesVideoPrompt({ ...input(), customPersonaBodyUrl: '/product-model.jpg' });
    expect(assembled.references).toHaveLength(1);
    expect(assembled.references[0].roles).toEqual(['persona_body', 'product']);
    expect(assembled.enginePrompt).toContain('人物主体参考：@图片1');
    expect(assembled.enginePrompt).toContain('商品用途（@图片1');
  });

  it('lists the original main separately from derived body and face references', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/original-main.jpg' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references.map((slot) => [slot.kind, slot.url, slot.apiToken])).toEqual([
      ['persona_identity', '/original-main.jpg', '图片1'], ['persona_body', '/old-body.jpg', '图片2'],
      ['persona_face', '/old-face.jpg', '图片3'], ['product', '/product-model.jpg', '图片4'],
    ]);
    expect(assembled.enginePrompt).toContain('人物原始主图：@图片1');
    expect(assembled.enginePrompt).toContain('人物主体参考：@图片2');
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片3');
  });

  it('accepts an identity-only asset and never submits the same URL twice', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/main.jpg', avatarUrl: '', faceUrl: '', fullBodyUrl: '' };
    const only = assembleSalesVideoPrompt(request);
    expect(only.references.filter((slot) => slot.kind.startsWith('persona')).map((slot) => slot.url)).toEqual(['/main.jpg']);
    expect(only.enginePrompt).toContain('人物原始主图：@图片1');
    expect(only.warnings.some((warning) => warning.includes('尚未绑定'))).toBe(false);
    request.persona = { ...request.persona, faceUrl: '/main.jpg', fullBodyUrl: '/main.jpg' };
    expect(assembleSalesVideoPrompt(request).references.filter((slot) => slot.url === '/main.jpg')).toHaveLength(1);
  });

  it('does not leak a saved library main into a custom face binding', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/old-main.jpg' };
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/chosen-face.jpg' });
    expect(assembled.references.some((slot) => slot.kind === 'persona_identity' || slot.url === '/old-main.jpg')).toBe(false);
    expect(assembled.enginePrompt).toContain('人物人脸参考：@图片1');
  });

  it('preserves raw style observations for the editable template instead of rewriting them invisibly', () => {
    const request = input();
    request.script.visualSpec.styleSummary = '暖调，带有轻微美肤滤镜';
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('摄影质感：暖调，带有轻微美肤滤镜');
    expect(prompt).not.toContain('不作为二次磨皮');
    expect(prompt).not.toContain('不把一张参考表情冻结全片');
  });
});
