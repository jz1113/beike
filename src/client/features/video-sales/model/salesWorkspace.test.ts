import { describe, expect, it } from 'vitest';
import {
  initialSalesPane,
  salesOpeningProductUrl,
  salesActions,
  salesAspectChoices,
  salesAspectConflict,
  salesFlowSteps,
  salesHasRenderActivity,
  salesJobAllowed,
  salesAspectOptions,
  salesComposeResolution,
  salesParamSummary,
  salesPreviewClass,
  salesRedrawnCount,
  salesRenderStatus,
  salesResolveRefMode,
  salesResolveResolution,
  salesShotStatusLabel,
  salesVideoCapability,
  type SalesActionInput,
} from './salesWorkspace';

const ready: SalesActionInput = {
  hasName: true,
  hasUrl: false,
  usableImages: 2,
  hasScript: false,
  isCollecting: false,
  isPlanning: false,
  isRendering: false,
  planPhase: null,
  renderPhase: null,
  chatReady: true,
  videoReady: true,
  aspectConflict: null,
};

describe('sales opening product link', () => {
  it('drops a leftover product id when the draft has no product', () => {
    expect(salesOpeningProductUrl({ productUrl: '10235916959245' })).toBe('');
    expect(salesOpeningProductUrl({ productUrl: '  https://item.jd.com/1.html  ', productName: '  ' })).toBe('');
  });

  it('keeps the link when a collected product or script is already saved', () => {
    expect(salesOpeningProductUrl({ productUrl: '10235916959245', productName: '连衣裙' })).toBe('10235916959245');
    expect(salesOpeningProductUrl({ productUrl: 'https://item.jd.com/1.html', imageCatalog: [{ url: 'https://img' }] })).toBe('https://item.jd.com/1.html');
    expect(salesOpeningProductUrl({ productUrl: 'https://item.jd.com/1.html', scripts: [{}] })).toBe('https://item.jd.com/1.html');
  });
});

describe('sales workspace actions', () => {
  it('asks for a presenter before planning apparel', () => {
    const action = salesActions({ ...ready, needsFashionPerson: true });
    expect(action.plan.reason).toBe('请上传出镜人物');
    expect(action.plan.disabled).toBe(true);
  });

  it('asks for a product before planning', () => {
    const action = salesActions({ ...ready, hasName: false, usableImages: 0 });
    expect(action.primary).toBe('plan');
    expect(action.plan.disabled).toBe(true);
    expect(action.plan.reason).toMatch(/商品链接/);
  });

  it('blocks planning when the named product has no usable image', () => {
    expect(salesActions({ ...ready, usableImages: 0 }).plan.reason).toMatch(/可用商品图/);
  });

  it('blocks planning until an analysis model is configured', () => {
    expect(salesActions({ ...ready, chatReady: false }).plan.reason).toMatch(/多模态模型/);
  });

  it('keeps planning locked while product images are uploading', () => {
    const action = salesActions({ ...ready, hasScript: true, isUploading: true });
    expect(action.primary).toBe('plan');
    expect(action.plan.label).toBe('正在上传图片…');
    expect(action.plan.disabled).toBe(true);
    expect(salesJobAllowed({ collecting: false, planning: false, rendering: false, uploading: true }, 'plan')).toBe(false);
  });

  it('switches the primary action to render after a script exists', () => {
    const action = salesActions({ ...ready, hasScript: true });
    expect(action.primary).toBe('render');
    expect(action.render.label).toBe('确认方案，生成视频');
    expect(action.plan.label).toBe('重新生成方案');
  });

  it('explains video and aspect blockers without changing the aspect', () => {
    expect(salesActions({ ...ready, hasScript: true, videoReady: false }).render.reason).toMatch(/视频模型/);
    expect(salesActions({ ...ready, hasScript: true, needsSceneFrames: true, imageReady: false }).render.reason).toMatch(/绘图模型/);
    expect(salesActions({ ...ready, hasScript: true, needsSceneFrames: true, imageReady: false }).render.disabled).toBe(true);
    expect(salesActions({ ...ready, hasScript: true, redrawScenes: true, imageReady: false }).render.reason).toBeNull();
    expect(salesActions({ ...ready, hasScript: true, aspectConflict: '当前视频模型不支持 3:4' }).render.reason).toMatch(/3:4/);
    expect(salesActions({ ...ready, hasScript: true, fashionPromptMissing: true }).render.reason).toBe('请按服饰带货重新生成方案');
  });

  it('hides validation reasons while a job is running and keeps the plan action primary', () => {
    const action = salesActions({ ...ready, hasScript: true, isPlanning: true, planPhase: 'script', hasName: false });
    expect(action.primary).toBe('plan');
    expect(action.plan.label).toMatch(/分镜/);
    expect(action.plan.reason).toBeNull();
    expect(action.plan.disabled).toBe(true);
  });
});

describe('sales model capability', () => {
  it('disables aspects the resolved model does not support', () => {
    const choices = salesAspectChoices('veo3.1');
    expect(choices.find((item) => item.value === '3:4')?.disabled).toBe(true);
    expect(choices.find((item) => item.value === '9:16')?.disabled).toBe(false);
    expect(salesAspectConflict('veo3.1', '3:4')).toMatch(/不支持/);
  });

  it('leaves an unregistered model unrestricted', () => {
    expect(salesAspectChoices('my-shop-video').every((item) => !item.disabled)).toBe(true);
    expect(salesAspectConflict('my-shop-video', '3:4')).toBeNull();
    expect(salesVideoCapability('my-shop-video').known).toBe(false);
    expect(salesVideoCapability('my-shop-video').note).toMatch(/尚未登记/);
  });

  it('describes a registered model without inventing a percentage', () => {
    expect(salesVideoCapability('doubao-seedance-2.5').note).toMatch(/单镜头/);
    expect(salesRenderStatus({ renderPhase: 'redrawing', done: 1, total: 4, hasResult: false })).toBe('正在重绘参考图 1/4');
    expect(salesRenderStatus({ renderPhase: 'generating', done: 1, total: 4, hasResult: false })).toBe('正在生成镜头 1/4');
    expect(salesActions({ ...ready, hasScript: true, isRendering: true, renderPhase: 'redrawing' }).render.label).toBe('正在重绘参考图…');
    expect(salesRedrawnCount([{ referenceFrameUrl: 'https://frame' }, { status: 'redrawing' }])).toBe(1);
  });

  it('summarizes the video params the way the homepage pill does', () => {
    expect(salesParamSummary({ refMode: 'omni', aspect: '9:16', resolution: '480P', duration: 15 })).toBe('全能参考 · 9:16 · 480P · 15秒');
    expect(salesParamSummary({ refMode: 'first_frame', aspect: '1:1', resolution: '720P', duration: 30 })).toBe('首帧生视频 · 1:1 · 720P · 30秒');
  });

  it('keeps a supported resolution and falls back when the model cannot use it', () => {
    expect(salesResolveResolution('doubao-seedance-2.0-mini', '480P')).toBe('480P');
    expect(salesResolveResolution('doubao-seedance-2.0-mini', '1080P')).toBe('480P');
    expect(salesResolveResolution('veo3.1', '480P')).toBe('720P');
    expect(salesResolveResolution('veo3.1', '1080P')).toBe('1080P');
  });

  it('keeps omni when the model supports it and falls back to a single reference image', () => {
    expect(salesResolveRefMode('doubao-seedance-2.0-mini', 'omni')).toBe('omni');
    expect(salesResolveRefMode('sora-2', 'omni')).toBe('first_frame');
    expect(salesResolveRefMode(undefined, 'first_frame')).toBe('first_frame');
  });

  it('maps generation resolution onto the two compose sizes', () => {
    expect(salesComposeResolution('480P')).toBe('720p');
    expect(salesComposeResolution('720P')).toBe('720p');
    expect(salesComposeResolution('1080P')).toBe('1080p');
    expect(salesComposeResolution('4K')).toBe('1080p');
  });

  it('shows homepage aspects but only enables ratios the compose step can output', () => {
    const veo = salesAspectOptions('veo3.1');
    expect(veo.find((item) => item.id === '21:9')?.disabled).toBe(true);
    expect(veo.find((item) => item.id === '3:4')?.disabled).toBe(true);
    expect(veo.find((item) => item.id === '9:16')?.disabled).toBe(false);
    const seedance = salesAspectOptions('doubao-seedance-2.0-mini');
    expect(seedance.find((item) => item.id === '1:1')?.disabled).toBe(false);
    expect(seedance.find((item) => item.id === 'adaptive')?.disabled).toBe(true);
  });
});

describe('sales workspace flow', () => {
  it('moves from preparation to confirmation and then rendering', () => {
    expect(salesFlowSteps({ hasScript: false, isCollecting: true, isPlanning: false, isRendering: false, hasRenderActivity: false })[0].state).toBe('current');
    const confirm = salesFlowSteps({ hasScript: true, isCollecting: false, isPlanning: false, isRendering: false, hasRenderActivity: false });
    expect(confirm.find((step) => step.id === 'confirm')?.state).toBe('current');
    expect(confirm.find((step) => step.id === 'prepare')?.state).toBe('done');
    const render = salesFlowSteps({ hasScript: true, isCollecting: false, isPlanning: false, isRendering: true, hasRenderActivity: true });
    expect(render.find((step) => step.id === 'render')?.label).toBe('正在生成视频');
  });

  it('opens the result pane only when render activity already exists', () => {
    expect(initialSalesPane(false)).toBe('plan');
    expect(initialSalesPane(true)).toBe('result');
    expect(salesHasRenderActivity([{ status: 'failed' }], null)).toBe(true);
    expect(salesHasRenderActivity([{ status: 'pending' }], null)).toBe(false);
  });

  it('keeps preview frames on the selected aspect', () => {
    expect(salesPreviewClass('16:9', 'hero')).toContain('aspect-video');
    expect(salesPreviewClass('9:16', 'shot')).toContain('aspect-[9/16]');
    expect(salesPreviewClass('3:4', 'hero')).toContain('aspect-[3/4]');
    expect(salesPreviewClass('1:1', 'hero')).toContain('aspect-square');
  });

  it('names uncertain shots without treating them as finished', () => {
    expect(salesShotStatusLabel('uncertain')).toBe('提交未确认');
    expect(salesShotStatusLabel('redrawing')).toBe('重绘中');
    expect(salesShotStatusLabel('generating')).toBe('生成中');
    expect(salesShotStatusLabel(undefined, true)).toBe('已完成');
  });

  it('rejects a second collect, plan, or render while one job is active', () => {
    expect(salesJobAllowed({ collecting: false, planning: false, rendering: false }, 'plan')).toBe(true);
    expect(salesJobAllowed({ collecting: true, planning: false, rendering: false }, 'render')).toBe(false);
    expect(salesJobAllowed({ collecting: false, planning: true, rendering: false }, 'collect')).toBe(false);
    expect(salesJobAllowed({ collecting: false, planning: false, rendering: true }, 'render')).toBe(false);
  });
});
