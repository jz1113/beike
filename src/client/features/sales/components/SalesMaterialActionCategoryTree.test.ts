import { Children, isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { SalesMaterialActionCategoryTree } from './SalesMaterialActionCategoryTree';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('react-dom', async (original) => ({ ...await original<typeof import('react-dom')>(), createPortal: (child: unknown) => child }));
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof SalesMaterialActionCategoryTree>[0];
const fashion = { id: 'fashion', kind: 'category' as const, name: '服饰与穿搭商品分类' };
const empty = { id: 'empty', kind: 'category' as const, name: '空分类' };
function nodes(root: Node): Node[] {
  const result = [root];
  Children.forEach(root.props.children as ReactElement, (child) => {
    if (isValidElement<Record<string, unknown>>(child)) result.push(...nodes(child));
  });
  return result;
}
function find(root: Node, label: string) {
  return nodes(root).find((node) => node.props['aria-label'] === label)!;
}
function category(root: Node, label: string) {
  return nodes(root).find((node) => node.type === 'button' && text(node) === label)!;
}
function text(root: Node): string {
  return Children.toArray(root.props.children as ReactElement).map((child) => isValidElement<Record<string, unknown>>(child) ? text(child) : String(child)).join('');
}
function click(node: Node) { (node.props.onClick as () => void)(); }
function change(node: Node, value: string) { (node.props.onChange as (event: unknown) => void)({ target: { value } }); }
function submit(root: Node) { (nodes(root).find((node) => node.type === 'form')!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); }
function render(overrides: Partial<Props> = {}) {
  hooks.index = 0;
  return SalesMaterialActionCategoryTree({
    categories: [fashion, empty], actionCards: [{ categoryId: 'fashion' }, { categoryId: 'fashion' }],
    activeFilter: 'all', loading: false, onSelectFilter: vi.fn(),
    filterOptions: [{ value: 'all', label: '全部分类', count: 2 }, { value: 'unclassified', label: '未分类', count: 1 },
      { value: 'category:fashion', label: fashion.name, count: 1 }, { value: 'category:empty', label: empty.name, count: 0 }],
    ...overrides,
  });
}

beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('action product category navigation', () => {
  it('shows only custom categories with unified counts and keeps empty categories visible', () => {
    const root = render();
    expect(root.type).toBe('nav');
    expect(root.props['aria-label']).toBe('动作商品类目导航');
    expect(category(root, '全部分类2 组')).toBeUndefined();
    expect(category(root, '未分类1 组')).toBeUndefined();
    expect(find(root, '新建商品类目')).toBeUndefined();
    expect(find(root, '管理商品类目')).toBeUndefined();
    const selected = category(root, `${fashion.name}1 组`);
    expect(selected).toBeDefined();
    expect(selected.props.title).toBe(fashion.name);
    expect(category(root, '空分类0 组')).toBeDefined();
    expect(nodes(root).filter((node) => node.type === 'button')).toHaveLength(2);
  });

  it('keeps an empty navigation quiet and reports loading without zero counts', () => {
    const loaded = render({ categories: [], actionCards: [], filterOptions: undefined });
    expect(nodes(loaded).filter((node) => node.type === 'button')).toHaveLength(0);
    const pending = render({ actionCards: [], filterOptions: undefined, loading: true });
    expect(pending.props['aria-busy']).toBe(true);
    expect(category(pending, `${fashion.name}…`).props.disabled).toBe(true);
    expect(category(pending, '空分类…').props.disabled).toBe(true);
    expect(nodes(pending).find((node) => node.props.role === 'status')?.props.children).toBe('正在读取分类…');
    expect(text(pending)).not.toContain('0 组');
  });

  it('selects custom categories and reflects the parent selection', () => {
    const onSelectFilter = vi.fn();
    const root = render({ onSelectFilter, activeFilter: 'category:fashion' });
    expect(category(root, `${fashion.name}1 组`).props['aria-current']).toBe('true');
    expect(category(root, '空分类0 组').props['aria-current']).toBeUndefined();
    click(category(root, '空分类0 组'));
    expect(onSelectFilter.mock.calls).toEqual([['category:empty']]);
  });

  it('preserves inline renaming and confirmed category removal', async () => {
    const onRenameCategory = vi.fn().mockResolvedValue(true);
    const onRemoveCategory = vi.fn().mockResolvedValue(true);
    const props = { onRenameCategory, onRemoveCategory };
    const button = category(render(props), `${fashion.name}1 组`);
    (button.props.onDoubleClick as () => void)();
    change(find(render(props), `修改 ${fashion.name} 名称`), ' 新名称 ');
    submit(render(props));
    await Promise.resolve();
    expect(onRenameCategory).toHaveBeenCalledWith(fashion.id, '新名称');
    expect(find(render(props), `修改 ${fashion.name} 名称`)).toBeUndefined();
    vi.stubGlobal('document', { body: {} });
    vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600 });
    vi.mocked(confirmAction).mockResolvedValue(true);
    (category(render(props), `${fashion.name}1 组`).props.onContextMenu as (event: unknown) => void)({ preventDefault() {}, stopPropagation() {}, clientX: 200, clientY: 100 });
    click(category(render(props), '删除'));
    await Promise.resolve();
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ description: '关联动作与脚本将转为未分类，动作素材本身保留。' }));
    expect(onRemoveCategory).toHaveBeenCalledWith(fashion);
  });
});
