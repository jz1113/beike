import { describe, expect, it } from 'vitest';
import {
  salesOpeningProductUrl,
  salesAspectChoices,
  salesAspectConflict,
  salesJobAllowed,
  salesAspectOptions,
  salesParamSummary,
  salesPreviewClass,
  salesRenderStatus,
  salesDurationEnabled,
  salesRefModeChoices,
  salesResolveRefMode,
  salesResolveResolution,
  salesShotStatusLabel,
  salesVideoCapability,
} from './salesWorkspace';

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

  it('lists Vidu Q4 preview modes and keeps a supported choice', () => {
    expect(salesRefModeChoices('vidu-q4-preview').map((item) => item.id)).toEqual(['omni', 'first_frame', 'first_last_frame', 'text']);
    expect(salesResolveRefMode('viduq4', 'first_frame')).toBe('first_frame');
    expect(salesResolveRefMode('viduq4-preview', 'edit')).toBe('omni');
    expect(salesDurationEnabled('viduq4-preview', 15)).toBe(true);
    expect(salesDurationEnabled('viduq4-preview', 30)).toBe(false);
    expect(salesDurationEnabled('viduq4-preview', 60)).toBe(false);
    expect(salesVideoCapability('vidu-q4-preview').known).toBe(true);
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
  it('keeps preview frames on the selected aspect', () => {
    expect(salesPreviewClass('16:9', 'hero')).toContain('aspect-video');
    expect(salesPreviewClass('9:16', 'shot')).toContain('aspect-[9/16]');
    expect(salesPreviewClass('3:4', 'hero')).toContain('aspect-[3/4]');
    expect(salesPreviewClass('1:1', 'hero')).toContain('aspect-square');
  });

  it('names uncertain shots without treating them as finished', () => {
    expect(salesShotStatusLabel('uncertain')).toBe('提交未确认');
    expect(salesShotStatusLabel('redrawing')).toBe('等待');
    expect(salesShotStatusLabel('generating')).toBe('生成中');
    expect(salesShotStatusLabel(undefined, true)).toBe('已完成');
    expect(salesRenderStatus({ renderPhase: 'querying', done: 0, total: 2, hasResult: false })).toBe('正在查询历史镜头');
  });

  it('rejects a second collect, plan, or render while one job is active', () => {
    expect(salesJobAllowed({ collecting: false, planning: false, rendering: false }, 'plan')).toBe(true);
    expect(salesJobAllowed({ collecting: true, planning: false, rendering: false }, 'render')).toBe(false);
    expect(salesJobAllowed({ collecting: false, planning: true, rendering: false }, 'collect')).toBe(false);
    expect(salesJobAllowed({ collecting: false, planning: false, rendering: true }, 'render')).toBe(false);
  });
});
