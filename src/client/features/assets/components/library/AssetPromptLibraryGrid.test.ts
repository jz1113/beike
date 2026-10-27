import { createElement, Fragment, type ComponentProps, type MouseEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import PromptAssetCard from '../cards/PromptAssetCard';
import { AssetPromptLibraryGrid } from './AssetPromptLibraryGrid';

const viewport = vi.hoisted(() => ({ start: 0 }));
const cards = vi.hoisted(() => new Map<string, ComponentProps<typeof PromptAssetCard>>());
vi.mock('./VirtualAssetGrid', () => ({
  VirtualAssetGrid: ({ items, renderItem }: { items: AssetLibrarySlim[]; renderItem: (item: AssetLibrarySlim, index: number) => React.ReactNode }) =>
    createElement(Fragment, null, ...items.slice(viewport.start).map((item, index) => renderItem(item, viewport.start + index))),
}));
vi.mock('../cards/PromptAssetCard', async importOriginal => {
  const original = await importOriginal<typeof import('../cards/PromptAssetCard')>();
  return { default: (props: ComponentProps<typeof PromptAssetCard>) => {
    cards.set(props.item.id, props);
    return createElement(original.default, props);
  } };
});

const items: AssetLibrarySlim[] = [
  { id: 'a', displayNumber: 9 }, { id: 'b', displayNumber: 27 }, { id: 'c', displayNumber: 104 },
];
const noop = () => {};
function renderGrid(displayedItems: AssetLibrarySlim[]) {
  const openGroupPreview = vi.fn();
  const props: ComponentProps<typeof AssetPromptLibraryGrid> = {
    activeSubTab: 'full_prompt', items, displayedItems, promptGroupCategories: [], promptGroupAlbums: [],
    subcategoryFolders: [], assetScrollRef: { current: null }, loadError: null, isLoading: false,
    promptGroupCategoryFilter: 'all', promptGroupSubcategoryFilter: 'all', currentFolderName: '',
    isBatchMode: false, selectedIds: [], openCardMenuId: null, copiedId: null, galleryLabels: new Map(),
    showLifecycleFilters: false, lifecycleFilter: 'all', setLifecycleFilter: noop, dynamicTagList: [],
    selectedTag: null, setSelectedTag: noop, sortBy: 'default', setSortBy: noop, hasContentFilters: false,
    clearContentFilters: noop, resetKey: '', openCategoryFolder: noop, openSubcategoryFolder: noop,
    applyOrganization: noop, showToast: noop, refreshAssets: noop, handleResetAllFilters: noop,
    selectCard: () => false, openGroupPreview, openDetailItem: noop, setAtomicPreview: noop,
    setMoveItems: noop, setOpenCardMenuId: noop, setSelectedIds: noop, setIsBatchMode: noop,
    selectionAnchorRef: { current: null }, setAssetContextMenu: noop, toggleSelectItem: noop,
    toggleFavorite: noop, setZoomImageUrl: noop, withAssetDetail: async () => {}, handleCopyPrompt: noop,
    getAssetPreviewText: () => '', setEditingItem: noop, setTagEditItem: noop, onFeedReference: noop, deleteAsset: noop,
  };
  const html = renderToStaticMarkup(createElement(AssetPromptLibraryGrid, props));
  return { html, openGroupPreview };
}

describe('图库当前列表序号', () => {
  beforeEach(() => { cards.clear(); viewport.start = 0; });

  it.each([
    ['全部', items], ['筛选', [items[1]]], ['排序', [items[2], items[0], items[1]]], ['删除', [items[0], items[2]]],
  ] as const)('%s后从 01 连续编号，卡片各预览入口传递相同序号', (_, displayed) => {
    const { html, openGroupPreview } = renderGrid([...displayed]);
    displayed.forEach((item, index) => {
      expect(html).toContain(`aria-label="图组 ${String(index + 1).padStart(2, '0')}"`);
      const card = cards.get(item.id)!;
      const event = { stopPropagation: noop } as MouseEvent;
      card.onCardClick(event);
      card.onViewDetail(event);
      expect(openGroupPreview).toHaveBeenLastCalledWith(item, index + 1);
      expect(card.listPosition).toBe(index + 1);
    });
    expect(html).not.toContain('aria-label="图组 104"');
    expect(items.map(item => item.displayNumber)).toEqual([9, 27, 104]);
  });

  it('滚动只渲染后续行时仍使用完整列表序号', () => {
    viewport.start = 2;
    const { html } = renderGrid(items);
    expect(html).toContain('aria-label="图组 03"');
    expect(html).not.toContain('aria-label="图组 01"');
  });
});

describe('图库操作入口', () => {
  it('只有一条素材时隐藏没有必要的批量管理入口', () => {
    const { html } = renderGrid([items[0]]);
    expect(html).not.toContain('批量管理');
  });

  it('素材超过一条时保留批量管理入口', () => {
    const { html } = renderGrid(items.slice(0, 2));
    expect(html).toContain('批量管理');
  });
});
