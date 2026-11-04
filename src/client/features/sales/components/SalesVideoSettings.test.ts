import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoResolutionValue } from '@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { SalesVideoSettings } from './SalesVideoSettings';

const controls = vi.hoisted(() => ({
  model: undefined as ((value: string) => void) | undefined,
  mode: undefined as ((value: string) => void) | undefined,
  resolution: undefined as ((value: VideoResolutionValue) => void) | undefined,
}));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useState: () => [true, () => {}] }));
vi.mock('react-dom', async (original) => ({ ...await original<typeof import('react-dom')>(), createPortal: (children: unknown) => children }));
vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({ ConfiguredModelPicker: ({ onChange }: { onChange: (value: string) => void }) => {
  controls.model = onChange;
  return null;
} }));
vi.mock('@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab', async (original) => {
  const module = await original<typeof import('@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab')>();
  const { createElement: element } = await import('react');
  return { ...module, PromptBarVideoTab: (props: Parameters<typeof module.PromptBarVideoTab>[0]) => {
    controls.mode = props.onMode;
    controls.resolution = props.onResolution;
    return element(module.PromptBarVideoTab, props);
  } };
});
vi.mock('@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout', () => ({
  usePromptBarPopoverLayout: () => ({ panelRef: { current: null }, panelStyle: {} }),
}));

beforeEach(() => vi.stubGlobal('document', { body: {} }));
afterEach(() => vi.unstubAllGlobals());

describe('sales video settings duration label', () => {
  const script = normalizeScriptTemplate({ format: 'product', durationSec: 18.8, shots: [{ beats: [{ start: 0, end: 18.8, action: '展示商品' }] }] })!;
  const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2-0-fast-260128' };
  const render = (overrides = {}) => renderToStaticMarkup(createElement(SalesVideoSettings, {
    plan, script, videoModels: [], references: [], disabled: false, onPatchPlan: () => {}, ...overrides,
  }));

  it('does not show the required 19 seconds as a supported model setting', () => {
    const html = render();
    expect(html).toContain('时长不兼容');
    expect(html).not.toContain('19s');
  });

  it('shows the actual duration after switching to a compatible model', () => {
    expect(render({ plan: { ...plan, videoModel: 'doubao-seedance-2.5' } })).toContain('19s');
  });

  it.each([false, true])('allows 4–30 seconds for Seedance 2.5 despite an 18.8-second storyboard (planning=%s)', (planning) => {
    const html = render({ planning, plan: { ...plan, videoModel: 'doubao-seedance-2.5' } });
    expect(html).toContain('aria-valuemin="4"');
    expect(html).toContain('aria-valuemax="30"');
    expect(html).toContain('aria-valuenow="19"');
    expect(html).toContain('完整动作段');
  });

  it('keeps the full range available after shortening the storyboard so it can be expanded again', () => {
    const html = render({ script: { ...script, durationSec: 6.8 }, plan: { ...plan, videoModel: 'doubao-seedance-2.5', videoDurationSec: 10 } });
    expect(html).toContain('10s');
    expect(html).toContain('aria-valuemin="4"');
    expect(html).toContain('aria-valuemax="30"');
    expect(html).toContain('aria-valuenow="10"');
  });

  it('retains a selected 14-second duration when changing the model with a longer reference script', () => {
    const onPatchPlan = vi.fn();
    render({ plan: { ...plan, videoDurationSec: 14 }, onPatchPlan });
    controls.model!('doubao-seedance-2.5');
    expect(onPatchPlan).toHaveBeenCalledWith(expect.objectContaining({ videoModel: 'doubao-seedance-2.5', videoDurationSec: 14 }));
  });

  it.each(['mode', 'resolution'] as const)('retains a shortened duration when adjusting %s', (control) => {
    const onPatchPlan = vi.fn();
    render({ plan: { ...plan, videoModel: 'doubao-seedance-2.5', videoDurationSec: 14 }, onPatchPlan });
    if (control === 'mode') controls.mode!('first_frame');
    else controls.resolution!('480P');
    expect(onPatchPlan).toHaveBeenCalledWith(expect.objectContaining({ videoDurationSec: 14 }));
  });

  it.each(['mode', 'resolution'] as const)('replans a duration that the new %s cannot support', (control) => {
    const onPatchPlan = vi.fn();
    const shortScript = normalizeScriptTemplate({ durationSec: 4, shots: [{ beats: [{ start: 0, end: 4, action: '展示商品' }] }] })!;
    render({ script: shortScript, plan: { ...plan, videoModel: 'veo3.1', videoRefMode: 'first_frame', videoResolution: '720P', videoDurationSec: 4 }, onPatchPlan });
    if (control === 'mode') controls.mode!('omni');
    else controls.resolution!('1080P');
    expect(onPatchPlan).toHaveBeenCalledWith(expect.objectContaining({ videoDurationSec: 0 }));
  });

  it('marks a previously saved unsupported duration as incompatible', () => {
    const shortScript = { ...script, durationSec: 10 };
    expect(render({ script: shortScript, plan: { ...plan, videoDurationSec: 19 } })).toContain('时长不兼容');
  });
});
