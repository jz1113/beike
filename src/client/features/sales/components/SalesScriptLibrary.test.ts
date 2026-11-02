import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesScriptLibrary } from './SalesScriptLibrary';
import { SalesScriptCard } from './SalesScriptCard';
import { SalesActionCard } from './SalesActionCard';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { SalesMaterialActionCategoryTree } from './SalesMaterialActionCategoryTree';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useMemo: (fn: () => unknown) => fn(),
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));

const script: StoredSalesScript = { id: 's1', title: '转身展示', videoUrl: '/source.mp4', depthVideoUrl: '/depth.mp4', videoHash: '', status: 'verified',
  script: normalizeScriptTemplate({ title: '转身展示', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '转身' }] }] })!,
  model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' };
const action: SalesMaterialCard = { key: 'a1', id: 'a1', kind: 'action', title: '动作图片', description: '', tags: [], image: '/pose.jpg', audio: '', badge: '深度图片', mediaType: 'depth-image' };
type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node | undefined {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => {
      if (isValidElement<Record<string, unknown>>(child)) queue.push(child);
    });
  }
}
function text(root: Node): string {
  return Children.toArray(root.props.children as ReactElement).map((child) => isValidElement<Record<string, unknown>>(child) ? text(child) : String(child)).join('');
}
function render(patch: Partial<Parameters<typeof SalesScriptLibrary>[0]> = {}) {
  hooks.index = 0;
  return SalesScriptLibrary({ embedded: true, items: [script], actionCards: [action], loading: false,
    taxonomyItems: [{ id: 'fashion', name: '服饰', kind: 'category' }, { id: 'dance', name: '舞蹈', kind: 'style' }], taxonomyLoading: false,
    onManageTaxonomy: vi.fn(), onReview: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onRefresh: vi.fn(), ...patch });
}
function select(label: string, value: string) {
  (find(render(), (node) => node.type === SalesLibrarySelect && node.props.label === label)!.props.onChange as (value: string) => void)(value);
}

beforeEach(() => { hooks.index = 0; hooks.slots = []; });

describe('action library filters', () => {
  it('renders scripts and independent actions together in ascending title order', () => {
    const root = render({ items: [{ ...script, title: '动作2' }], actionCards: [{ ...action, title: '动作10' }, { ...action, key: 'a2', id: 'a2', title: '动作1' }] });
    const grid = find(root, (node) => node.props.className === 'sales-script-grid sales-reference-grid')!;
    const cards = Children.toArray(grid.props.children as ReactElement).filter(isValidElement<Record<string, unknown>>);
    expect(cards.map((card) => card.type === SalesScriptCard ? (card.props.item as StoredSalesScript).title : (card.props.card as SalesMaterialCard).title)).toEqual(['动作1', '动作2', '动作10']);
  });
  it.each(['empty library', 'empty category'])('shows upload directly in the grid for an %s', (state) => {
    if (state === 'empty category') (find(render(), (node) => node.type === SalesMaterialActionCategoryTree)!.props.onSelectFilter as (value: string) => void)('category:fashion');
    const root = render({ ...(state === 'empty library' ? { items: [], actionCards: [] } : {}), onOpenImport: vi.fn() });
    const grid = find(root, (node) => node.props.className === 'sales-script-grid sales-reference-grid')!;
    expect(find(grid, (node) => node.type === 'button' && String(node.props.className).includes('sales-reference-add-card'))).toBeDefined();
    expect(find(root, (node) => node.props.className === 'sales-library-empty-state')).toBeUndefined();
    if (state === 'empty library') expect(find(root, (node) => node.props.className === 'sales-asset-empty-notice')).toBeUndefined();
  });

  it.each([{ loading: true }, { loadError: '读取失败' }])('does not offer upload before the initial catalog is available: %j', (state) => {
    const root = render({ items: [], actionCards: [], onOpenImport: vi.fn(), ...state });
    expect(find(root, (node) => node.props.className === 'sales-library-empty-state')).toBeDefined();
    expect(find(root, (node) => String(node.props.className).includes('sales-reference-add-card'))).toBeUndefined();
  });

  it('opens category and style management from the shared entry', () => {
    const onManageTaxonomy = vi.fn();
    const root = render({ onManageTaxonomy });
    const manage = find(root, (node) => node.type === 'button' && node.props['aria-label'] === '管理分类与风格')!;
    expect(text(manage)).toBe('管理分类与风格');
    (manage.props.onClick as () => void)();
    expect(onManageTaxonomy).toHaveBeenCalledExactlyOnceWith('category');
  });

  it('keeps loaded cards visible after a refresh failure and provides a retry', () => {
    const onRefresh = vi.fn();
    const root = render({ loadError: '读取失败', onRefresh });
    expect(find(root, (node) => node.type === SalesScriptCard)?.props.item).toBe(script);
    expect(find(root, (node) => node.type === SalesActionCard)?.props.card).toBe(action);
    const alert = find(root, (node) => node.props.role === 'alert')!;
    expect(text(alert)).toContain('刷新失败，当前显示上次加载的素材。');
    (find(alert, (node) => node.type === 'button')!.props.onClick as () => void)();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('clears all active facets and search from an empty result without changing stored items', () => {
    select('按风格筛选', 'dance');
    (find(render(), (node) => node.type === SalesMaterialActionCategoryTree)!.props.onSelectFilter as (value: string) => void)('category:fashion');
    (find(render(), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '不存在' } });
    expect(find(render(), (node) => node.type === SalesScriptCard || node.type === SalesActionCard)).toBeUndefined();
    expect(find(render(), (node) => node.props.className === 'sales-asset-empty-notice')).toBeDefined();
    expect(find(render(), (node) => node.props.className === 'sales-library-empty-state')).toBeUndefined();
    const clear = find(render(), (node) => node.type === 'button' && node.props.children === '清除全部筛选')!;
    expect(clear).toBeDefined();
    (clear.props.onClick as () => void)();
    const root = render();
    expect(find(root, (node) => node.type === SalesScriptCard)?.props.item).toBe(script);
    expect(find(root, (node) => node.type === SalesActionCard)?.props.card).toBe(action);
    expect(find(root, (node) => node.type === 'input')?.props.value).toBe('');
    expect(find(root, (node) => node.props['aria-label'] === '已选筛选条件')).toBeUndefined();
  });

  it('removes one selected condition while keeping the remaining conditions', () => {
    select('按风格筛选', 'dance');
    (find(render(), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '动作图片' } });
    (find(render(), (node) => node.props['aria-label'] === '移除素材风格筛选')!.props.onClick as () => void)();
    const root = render();
    expect(find(root, (node) => node.type === SalesScriptCard)).toBeUndefined();
    expect(find(root, (node) => node.type === SalesActionCard)?.props.card).toBe(action);
    expect(find(root, (node) => node.props['aria-label'] === '移除搜索条件')).toBeDefined();
    expect(find(root, (node) => node.props['aria-label'] === '移除素材风格筛选')).toBeUndefined();
  });

  it('keeps sidebar counts in sync with search and restores all after a category is removed', () => {
    const tree = (root = render()) => find(root, (node) => node.type === SalesMaterialActionCategoryTree)!;
    expect(tree().props.compact).toBeUndefined();
    expect(tree().props.filterOptions).toEqual([
      { value: 'all', label: '全部分类', count: 2 },
      { value: 'unclassified', label: '未分类', count: 2 },
      { value: 'category:fashion', label: '服饰', count: 0 },
    ]);
    (find(render(), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '动作图片' } });
    expect(tree().props.filterOptions).toEqual(expect.arrayContaining([{ value: 'all', label: '全部分类', count: 1 }]));
    expect(find(render(), (node) => node.type === SalesActionCard)?.props.card).toBe(action);
    (tree().props.onSelectFilter as (value: string) => void)('category:fashion');
    const root = render({ taxonomyItems: [] });
    expect(tree(root).props.activeFilter).toBe('all');
    expect(find(root, (node) => node.props['aria-label'] === '移除素材分类筛选')).toBeUndefined();
    expect(find(root, (node) => node.type === SalesActionCard)?.props.card).toBe(action);
  });
});
