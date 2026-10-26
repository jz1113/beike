import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { VideoSalesMode } from '@shared/domain/sales';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { salesPlanInputRevision } from '../model/salesStageRules';
import { SalesPresentationSelect } from './SalesPresentationSelect';
import { SalesFooterCreationControls, SalesPlanningSettings } from './salesPlanning';

vi.mock('@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels', () => ({
  usePreferenceModels: () => ({ ready: false, imageModels: [], videoModels: [], multimodalModels: [] }), matchesStoredModel: () => false,
}));

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}

const modes: VideoSalesMode[] = ['live_presenter', 'product_closeup', 'scene_demo', 'graphic_montage'];

describe('simplified sales presentation choices', () => {
  it.each(modes)('shows two choices for %s without changing saved settings or plan signatures', (videoMode) => {
    const state = { ...defaultSalesStudioState, videoMode };
    const revision = salesPlanInputRevision(state);
    const onChange = vi.fn();
    for (const Component of [SalesFooterCreationControls, SalesPlanningSettings]) {
      const html = renderToStaticMarkup(createElement(Component, { state, disabled: false, onChange, onOpenRules: vi.fn() }));
      const select = html.match(/<select[^>]*aria-label="呈现方式"[\s\S]*?<\/select>/)?.[0];
      expect(select).toBeDefined();
      expect(select!.match(/<option /g)).toHaveLength(2);
      expect(select).toContain('人物讲解');
      expect(select).toContain('商品展示＋旁白');
      expect(select!.match(/<option[^>]*selected=""[^>]*>/)?.[0]).toContain(`value="${videoMode === 'live_presenter' ? 'live_presenter' : 'product_closeup'}"`);
      expect(select).not.toContain('value="scene_demo"');
      expect(select).not.toContain('value="graphic_montage"');
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(state.videoMode).toBe(videoMode);
    expect(salesPlanInputRevision(state)).toBe(revision);
  });
  it.each<VideoSalesMode>(['live_presenter', 'product_closeup'])('submits the original business value when explicitly choosing %s', (value) => {
    const onChange = vi.fn();
    const view = SalesPresentationSelect({ value: 'scene_demo', disabled: false, className: '', onChange });
    const select = nodes(view).find((node) => node.type === 'select')!;
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
  });
  it('keeps presentation selection disabled while the studio is busy', () => {
    const view = SalesPresentationSelect({ value: 'live_presenter', disabled: true, className: '', onChange: vi.fn() });
    expect(nodes(view).find((node) => node.type === 'select')!.props.disabled).toBe(true);
  });
  it('explains that product presentation includes hands, backs and faceless outfit displays', () => {
    const html = renderToStaticMarkup(createElement(SalesPresentationSelect, { value: 'product_closeup', disabled: false, className: '', showDescription: true, onChange: vi.fn() }));
    expect(html).toContain('商品、手部、背影或不露脸上身展示');
    expect(html).toContain('由脚本安排画面');
    expect(html).toContain('aria-description=');
  });
});
