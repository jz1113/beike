import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullPromptGroupPreview } from './FullPromptGroupPreview';
import { AssetDetailModal } from '../dialogs/AssetDetailModal';

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  createPortal: (children: ReactNode) => children,
}));
const noop = () => {};
const item = { id: 'group', displayNumber: 104, sourceImages: '[]', shotPromptsJson: '[]' };

describe('图组预览与详情序号', () => {
  beforeEach(() => vi.stubGlobal('document', { body: {} }));
  afterEach(() => vi.unstubAllGlobals());

  it.each([1, 12, 100])('预览沿用列表序号 %s，不被详情中的库内编号覆盖', listPosition => {
    const html = renderToStaticMarkup(createElement(FullPromptGroupPreview, {
      item, listPosition, productCategories: [], albums: [], copiedId: null,
      onClose: noop, onCopyPrompt: noop, onOpenTagEdit: noop, onOpenEdit: noop,
    }));
    expect(html).toContain(`aria-label="图组 ${String(listPosition).padStart(2, '0')} 图组预览"`);
    expect(html).not.toContain('图组 104');
  });

  it('详情沿用列表序号', () => {
    const html = renderToStaticMarkup(createElement(AssetDetailModal, {
      detailItem: { ...item, listPosition: 2 }, activeSubTab: 'full_prompt', detailLoading: false,
      detailActiveImageIndex: 0, copiedId: null, onClose: noop, onSelectImageIndex: noop,
      onZoomImage: noop, onCopyPrompt: noop, onOpenTagEdit: noop, onDeleteAsset: noop, getAssetPreviewText: () => '',
    }));
    expect(html).toContain('图组 02');
    expect(html).not.toContain('图组 104');
  });
});
