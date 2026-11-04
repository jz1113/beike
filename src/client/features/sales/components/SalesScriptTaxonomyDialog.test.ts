import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SalesScriptTaxonomyDialog } from './SalesScriptTaxonomyDialog';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: vi.fn(),
  useId: () => 'taxonomy-manager',
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof value === 'function' ? (value as (previous: T) => T)(hooks.slots[index] as T) : value;
    }];
  },
}));

type Node = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof SalesScriptTaxonomyDialog>[0];
const fashion = { id: 'fashion', kind: 'category' as const, name: '服饰' };
const home = { id: 'home', kind: 'category' as const, name: '家居' };
const dance = { id: 'dance', kind: 'style' as const, name: '手势舞' };
const speech = { id: 'speech', kind: 'style' as const, name: '口播' };
const create = vi.fn<Props['onCreate']>();
const rename = vi.fn<Props['onRename']>();
const remove = vi.fn<Props['onRemove']>();
const retry = vi.fn<Props['onRetry']>();
const close = vi.fn<Props['onClose']>();
function nodes(root: Node): Node[] {
  const result = [root];
  Children.forEach(root.props.children as ReactElement, (child) => {
    if (isValidElement<Record<string, unknown>>(child)) result.push(...nodes(child));
  });
  return result;
}
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const node = nodes(root).find(predicate);
  if (!node) throw new Error('Control not found');
  return node;
}
function text(root: Node): string {
  return Children.toArray(root.props.children as ReactElement).map((child) => isValidElement<Record<string, unknown>>(child) ? text(child) : String(child)).join('');
}
function render(overrides: Partial<Props> = {}) {
  hooks.index = 0;
  return SalesScriptTaxonomyDialog({ initialKind: 'category', items: [fashion, home, dance, speech], usageCounts: { fashion: 3, dance: 1 },
    loading: false, busy: false, error: '', onCreate: create, onRename: rename, onRemove: remove, onRetry: retry, onClose: close, ...overrides });
}
function button(label: string, root = render()) { return find(root, (node) => node.type === 'button' && text(node) === label); }
function labeled(label: string, root = render()) { return find(root, (node) => node.props['aria-label'] === label); }
function click(node: Node) { (node.props.onClick as () => void)(); }
function change(node: Node, value: string) { (node.props.onChange as (event: unknown) => void)({ target: { value } }); }
function submit(node: Node) { (node.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); }
function tab(label: string) { return find(render(), (node) => node.props.role === 'tab' && text(node).startsWith(label)); }
function form() { return find(render(), (node) => node.type === 'form'); }
function newInput() {
  const root = render();
  const label = find(root, (node) => node.type === 'label' && text(node).startsWith('新'));
  return find(root, (node) => node.type === 'input' && node.props.id === label.props.htmlFor);
}
function rowIds(root = render()) { return nodes(root).filter((node) => node.type === 'li').map((node) => node.key); }
function openRemoval() {
  const row = find(render(), (node) => node.type === 'li' && node.key === fashion.id);
  (row.props.onContextMenu as (event: unknown) => void)({ preventDefault() {}, stopPropagation() {}, clientX: 30, clientY: 40 });
  click(button('移除分类'));
}
function cancelDialog() { (render().props.onCancel as (event: unknown) => void)({ preventDefault() {} }); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.resetAllMocks();
  create.mockResolvedValue(true); rename.mockResolvedValue(true); remove.mockResolvedValue(true);
});

it('keeps category and style searches independent and retains their queries when switching', () => {
  expect(rowIds()).toEqual(['fashion', 'home']);
  const items = [fashion, home, dance, speech];
  for (const item of [fashion, dance]) {
    for (let i = 1; i <= 7; i++) items.push({ ...item, id: item.id + i, name: '其他' + i });
  }
  const full = () => render({ items });
  const search = (label: string) => labeled(label, full());
  expect(() => labeled('搜索分类', render({ items: items.filter((item) => item.id !== 'fashion7') }))).toThrow('Control not found');
  change(search('搜索分类'), '服');
  expect(rowIds(full())).toEqual(['fashion']);
  expect(text(full())).toContain('已关联 3 组');
  click(tab('拍摄风格'));
  change(search('搜索风格'), '舞');
  expect(rowIds(full())).toEqual(['dance']);
  click(tab('素材分类'));
  expect(search('搜索分类').props.value).toBe('服');
  expect(rowIds()).toEqual(['fashion']);
  click(tab('拍摄风格'));
  expect(search('搜索风格').props.value).toBe('舞');
  click(labeled('清除风格搜索'));
  expect(rowIds()).toEqual(['dance', 'speech']);
  expect(() => labeled('搜索风格')).toThrow('Control not found');
});

it('does not submit a duplicate category and allows the same name in another kind', async () => {
  click(button('新建分类'));
  change(newInput(), ' 服饰 ');
  expect(button('添加').props.disabled).toBe(true);
  submit(form());
  expect(create).not.toHaveBeenCalled();
  expect(text(labeled('管理类型'))).toContain('素材分类');
  click(tab('拍摄风格'));
  click(button('新建风格'));
  change(newInput(), ' 服饰 ');
  expect(button('添加').props.disabled).toBe(false);
  submit(form());
  await vi.waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith('style', '服饰'));
});

it('retains a new name after failure and clears the form only after a successful retry', async () => {
  create.mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce(true);
  click(button('新建分类'));
  change(newInput(), ' 新分类 ');
  submit(form());
  await vi.waitFor(() => expect(text(render())).toContain('网络暂时不可用'));
  expect(newInput().props.value).toBe(' 新分类 ');
  expect(close).not.toHaveBeenCalled();
  submit(form());
  await vi.waitFor(() => expect(text(render())).toContain('已添加「新分类」'));
  expect(create.mock.calls).toEqual([['category', '新分类'], ['category', '新分类']]);
  expect(() => newInput()).toThrow('Control not found');
});

it('retains edits on failed rename, blocks duplicate names, and trims a successful retry', async () => {
  rename.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  click(labeled('重命名分类 服饰'));
  change(labeled('重命名 服饰'), '家居');
  expect(button('保存').props.disabled).toBe(true);
  submit(form());
  expect(rename).not.toHaveBeenCalled();
  change(labeled('重命名 服饰'), ' 通勤服饰 ');
  submit(form());
  await vi.waitFor(() => expect(rename).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(button('保存').props.disabled).toBe(false));
  expect(labeled('重命名 服饰').props.value).toBe(' 通勤服饰 ');
  submit(form());
  await vi.waitFor(() => expect(text(render())).toContain('已重命名为「通勤服饰」'));
  expect(rename.mock.calls).toEqual([['fashion', '通勤服饰'], ['fashion', '通勤服饰']]);
  expect(() => labeled('重命名 服饰')).toThrow('Control not found');
});

it('does not write an unchanged name and leaves the rest of the dialog open', () => {
  click(labeled('重命名分类 服饰'));
  change(labeled('重命名 服饰'), ' 服饰 ');
  submit(form());
  expect(rename).not.toHaveBeenCalled();
  expect(() => labeled('重命名 服饰')).toThrow('Control not found');
  expect(close).not.toHaveBeenCalled();
});

it('requires explicit confirmation before removing a category and allows cancellation', () => {
  click(labeled('移除分类 服饰'));
  expect(remove).not.toHaveBeenCalled();
  expect(text(render())).toContain('素材、分镜和其他分类保留');
  click(button('取消'));
  expect(remove).not.toHaveBeenCalled();
  expect(rowIds()).toContain('fashion');
  expect(() => button('确认移除')).toThrow('Control not found');
});

it('blocks duplicate removal and closing while pending, and retains confirmation after failure', async () => {
  let resolve!: (value: boolean) => void;
  remove.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done; })).mockResolvedValueOnce(true);
  openRemoval();
  const confirm = button('确认移除');
  click(confirm); click(confirm);
  expect(remove).toHaveBeenCalledExactlyOnceWith(fashion);
  expect(button('确认移除').props.disabled).toBe(true);
  expect(tab('拍摄风格').props.disabled).toBe(true);
  cancelDialog();
  expect(close).not.toHaveBeenCalled();
  resolve(false);
  await vi.waitFor(() => expect(button('确认移除').props.disabled).toBe(false));
  expect(rowIds()).toContain('fashion');
  expect(close).not.toHaveBeenCalled();
  click(button('确认移除'));
  await vi.waitFor(() => expect(text(render())).toContain('已移除「服饰」'));
  expect(remove).toHaveBeenCalledTimes(2);
  expect(() => button('确认移除')).toThrow('Control not found');
});

it('cancels the active editor before closing the dialog and provides a read retry', () => {
  click(button('新建分类'));
  cancelDialog();
  expect(() => newInput()).toThrow('Control not found');
  expect(close).not.toHaveBeenCalled();
  const failed = render({ error: '分类读取失败' });
  click(button('重新读取', failed));
  expect(retry).toHaveBeenCalledOnce();
  cancelDialog();
  expect(close).toHaveBeenCalledOnce();
});

it('allows closing during a slow read while keeping writes unavailable', () => {
  const root = render({ loading: true });
  expect(labeled('关闭分类与风格管理', root).props.disabled).toBe(false);
  expect(button('新建分类', root).props.disabled).toBe(true);
  (root.props.onCancel as (event: unknown) => void)({ preventDefault() {} });
  expect(close).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});
