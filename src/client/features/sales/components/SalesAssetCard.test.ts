import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset } from '@shared/domain/sales';
import { SalesAssetCard } from './SalesAssetCard';

const asset: SalesCreativeAsset = { id: 'scene', kind: 'scene', label: '场景', prompt: '', required: true, status: 'generating', taskId: 'original', referenceAssetIds: ['missing'] };

describe('sales asset task actions', () => {
  it('queries a receipt without requiring a model, prompt or missing reference', () => {
    const onGenerate = vi.fn();
    const props = { asset, assets: [asset], legacyProductIndexes: [], disabled: false, modelReady: false, onEdit: vi.fn(), onGenerate };
    const card = SalesAssetCard(props);
    const html = renderToStaticMarkup(createElement(SalesAssetCard, props));
    expect(html).toContain('继续查询此素材（不重新生图）');
    const button = card.props.children.at(-1);
    expect(button.props.disabled).toBe(false);
    button.props.onClick();
    expect(onGenerate).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('disables resubmission for an uncertain asset without a receipt', () => {
    const card = SalesAssetCard({ asset: { ...asset, status: 'uncertain', taskId: undefined }, assets: [], legacyProductIndexes: [], disabled: false, modelReady: true, onEdit: vi.fn(), onGenerate: vi.fn() });
    expect(card.props.children.at(-1).props.disabled).toBe(true);
    expect(renderToStaticMarkup(card)).toContain('提交结果待核实');
  });
});
