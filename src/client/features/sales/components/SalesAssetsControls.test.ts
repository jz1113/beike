import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/sales';
import { SalesAssetsSection } from './SalesAssetsSection';
import { SalesAssetCard } from './SalesAssetCard';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesPlanSection } from './salesPlanning';

vi.mock('@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels', () => ({
  usePreferenceModels: () => ({ ready: false, imageModels: [], videoModels: [], multimodalModels: [] }), matchesStoredModel: () => false,
}));
const script: VideoSalesScript = { id: 's', title: '商品口播', totalDuration: 15, deliveryMode: 'single', assets: [],
  seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  shots: [{ shotId: 1, type: 'hook', duration: 15, description: '展示商品', speechMode: 'voiceover', voiceover: '看这个商品', camera: '中景', visualSource: 'product_image', transition: 'direct_concat' }],
};
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}

describe('sales asset controls and legacy speech labels', () => {
  it('wires the image model picker and per-asset prompt editing to the studio', () => {
    const asset: SalesCreativeAsset = { id: 'scene', kind: 'scene', label: '场景', prompt: '自然光房间', required: true };
    const onModel = vi.fn();
    const onEditPrompt = vi.fn();
    const view = SalesAssetsSection({ script: { ...script, assets: [asset] }, imageModel: 'chosen-image', disabled: false, onModel, onEditPrompt, onGenerate: vi.fn() });
    const picker = nodes(view).find((node) => node.type === SalesModelPicker)!;
    (picker.props.onChange as (id: string) => void)('new-image');
    expect(onModel).toHaveBeenCalledWith('new-image');
    const card = nodes(view).find((node) => node.type === SalesAssetCard)!;
    (card.props.onEdit as (prompt: string) => void)('新的房间');
    expect(onEditPrompt).toHaveBeenCalledWith('scene', '新的房间');
    const html = renderToStaticMarkup(view);
    expect(html).toContain('绘图模型');
    expect(html).toContain('场景绘图提示词');
  });
  it('does not label a legacy unmarked speech source as voiceover', () => {
    const html = renderToStaticMarkup(createElement(SalesPlanSection, { script: { ...script, shots: [{ ...script.shots[0], speechMode: undefined }] }, disabled: false, onEditShot: vi.fn() }));
    expect(html).toContain('声音未标注');
    expect(html).not.toContain('画外音 ·');
  });
});
