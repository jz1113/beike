import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type AssembleSalesPromptInput } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

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

describe('sales video identity anchors', () => {
  it.each([
    { customPersonaBodyUrl: '/new-body.jpg' },
    { customPersonaFaceUrl: '/new-face.jpg' },
    { customPersonaBodyUrl: '/new-body.jpg', customPersonaFaceUrl: '/new-face.jpg' },
  ])('isolates a custom anchor set from stale library identity: %j', (custom) => {
    const assembled = assembleSalesVideoPrompt({ ...input(), ...custom });
    expect(assembled.references.filter((slot) => slot.kind.startsWith('persona')).map((slot) => slot.url)).toEqual(Object.values(custom));
    expect(assembled.enginePrompt).toContain('唯一出镜人物（自定义人物）');
    expect(assembled.enginePrompt).not.toContain('旧库人物');
    expect(assembled.references.some((slot) => slot.url.startsWith('/old-') || slot.label.includes('旧库人物'))).toBe(false);
    expect(assembled.warnings.some((warning) => warning.includes('尚未绑定'))).toBe(false);
  });

  it('gives a separate face anchor priority over the body image and excludes other models', () => {
    const assembled = assembleSalesVideoPrompt(input());
    expect(assembled.references.slice(0, 3).map((slot) => [slot.kind, slot.apiToken, slot.url])).toEqual([
      ['persona_body', '图片1', '/old-body.jpg'], ['persona_face', '图片2', '/old-face.jpg'], ['product', '图片3', '/product-model.jpg'],
    ]);
    expect(assembled.enginePrompt).toContain('人脸身份以 图片2 为唯一依据');
    expect(assembled.enginePrompt).toContain('身形与体态参考 图片1');
    expect(assembled.enginePrompt).toContain('该图中的脸不覆盖人脸锚点');
    expect(assembled.enginePrompt).toContain('不提供其中模特的人脸、发型、年龄或身形');
    expect(assembled.enginePrompt).toContain('原片的柔化和曝光仅作为摄影处理');
  });

  it('uses an avatar-only library asset as a face anchor without pretending it supplies a body', () => {
    const request = input();
    request.persona = { ...request.persona!, fullBodyUrl: '', faceUrl: '' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references[0]).toMatchObject({ kind: 'persona_face', url: '/old-avatar.jpg' });
    expect(assembled.enginePrompt).toContain('人脸身份以 图片1 为唯一依据');
    expect(assembled.enginePrompt).toContain('身形没有独立锚点');
  });

  it('does not add a face to a product-only script because a persona selection was left over', () => {
    const request = input();
    request.script.assetSlots.persona = { ...request.script.assetSlots.persona, required: false, presence: 'none' };
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/new-face.jpg' });
    expect(assembled.references.every((slot) => !slot.kind.startsWith('persona'))).toBe(true);
    expect(assembled.enginePrompt).toContain('纯商品展示，不新增模特、人脸或手部');
    expect(assembled.enginePrompt).not.toContain('唯一出镜人物');
  });

  it('keeps hands-only references in scope and does not send a face anchor', () => {
    const request = input();
    request.script.assetSlots.persona.presence = 'hands_only';
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references.some((slot) => slot.kind === 'persona_face')).toBe(false);
    expect(assembled.references[0]).toMatchObject({ url: '/old-body.jpg', label: '手部形象（旧库人物）' });
    expect(assembled.enginePrompt).toContain('仅手部出镜');
    expect(assembled.enginePrompt).toContain('不新增人脸或全身模特');
    expect(assembled.enginePrompt).not.toContain('人脸身份以');
  });

  it('still binds a chosen face for a visible presenter whose reference is optional', () => {
    const request = input();
    request.script.assetSlots.persona.required = false;
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/chosen-face.jpg' });
    expect(assembled.references[0]).toMatchObject({ kind: 'persona_face', url: '/chosen-face.jpg' });
    expect(assembled.enginePrompt).toContain('人脸身份以 图片1 为唯一依据');
  });

  it('keeps a shared identity/product URL singular while naming its two explicit roles', () => {
    const request = input();
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaBodyUrl: '/product-model.jpg' });
    expect(assembled.references).toHaveLength(1);
    expect(assembled.enginePrompt).toContain('人脸身份以 图片1 为唯一依据');
    expect(assembled.enginePrompt).toContain('商品外观 图片1');
    expect(assembled.enginePrompt).toContain('若同一图片也被明确指定为人物锚点');
  });

  it('carries the original main alongside derived face/body and gives it identity priority', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/original-main.jpg' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references.map((slot) => [slot.kind, slot.url, slot.apiToken])).toEqual([
      ['persona_identity', '/original-main.jpg', '图片1'], ['persona_body', '/old-body.jpg', '图片2'],
      ['persona_face', '/old-face.jpg', '图片3'], ['product', '/product-model.jpg', '图片4'],
    ]);
    expect(assembled.enginePrompt).toContain('原始人物主图 图片1 为唯一身份依据');
    expect(assembled.enginePrompt).toContain('图片2 仅补充身形、体态和视角');
    expect(assembled.enginePrompt).toContain('图片3 仅补充面部角度与细节');
    expect(assembled.enginePrompt).toContain('补图与原始主图冲突时以原始主图为准');
    expect(assembled.enginePrompt).not.toContain('人脸身份以 图片3 为唯一依据');
  });

  it('accepts an identity-only asset and never uploads the same anchor URL twice', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/main.jpg', avatarUrl: '', faceUrl: '', fullBodyUrl: '' };
    const only = assembleSalesVideoPrompt(request);
    expect(only.references.filter((slot) => slot.kind.startsWith('persona')).map((slot) => slot.url)).toEqual(['/main.jpg']);
    expect(only.enginePrompt).toContain('原始人物主图 图片1 为唯一身份依据');
    expect(only.warnings.some((warning) => warning.includes('尚未绑定'))).toBe(false);
    request.persona = { ...request.persona, faceUrl: '/main.jpg', fullBodyUrl: '/main.jpg' };
    const shared = assembleSalesVideoPrompt(request);
    expect(shared.references.filter((slot) => slot.url === '/main.jpg')).toHaveLength(1);
    expect(shared.references[0].kind).toBe('persona_identity');
  });

  it('does not let a saved library main leak into a custom face binding', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/old-main.jpg' };
    const assembled = assembleSalesVideoPrompt({ ...request, customPersonaFaceUrl: '/chosen-face.jpg' });
    expect(assembled.references.some((slot) => slot.kind === 'persona_identity')).toBe(false);
    expect(assembled.references.some((slot) => slot.url === '/old-main.jpg')).toBe(false);
    expect(assembled.enginePrompt).toContain('人脸身份以 图片1 为唯一依据');
  });

  it('anchors makeup to the original image without inheriting derived portraits or freezing their expression', () => {
    const request = input();
    request.persona = { ...request.persona!, identityUrl: '/original-main.jpg' };
    request.script.visualSpec.styleSummary = '暖调，带有轻微美肤滤镜';
    const prompt = assembleSalesVideoPrompt(request).enginePrompt;
    expect(prompt).toContain('妆容浓淡同样以该原图为准');
    expect(prompt).toContain('图片3 仅补充面部角度与细节，不覆盖原图的妆容、肤色与皮肤纹理');
    expect(prompt).toContain('不把一张参考表情冻结全片或逐段重置妆容');
    expect(prompt).toContain('垂眼不等于闭眼停留');
    expect(prompt).toContain('除本段明确记录闭眼动作外');
    expect(prompt).toContain('美颜滤镜仅作为原片观察，不作为二次磨皮');
  });

  it('keeps an identity-only hands asset restricted to visible hands', () => {
    const request = input();
    request.script.assetSlots.persona.presence = 'hands_only';
    request.persona = { ...request.persona!, identityUrl: '/main.jpg', faceUrl: '', fullBodyUrl: '', avatarUrl: '' };
    const assembled = assembleSalesVideoPrompt(request);
    expect(assembled.references[0]).toMatchObject({ kind: 'persona_identity', url: '/main.jpg' });
    expect(assembled.enginePrompt).toContain('手部形态与肤色参考 图片1 中可见的手部');
    expect(assembled.enginePrompt).not.toContain('唯一出镜人物');
    expect(assembled.enginePrompt).not.toContain('五官比例');
  });
});
