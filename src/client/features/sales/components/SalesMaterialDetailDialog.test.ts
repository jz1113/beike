import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { updateSalesMaterial, updateSalesSound } from '../api/salesMaterials';
import { salesMaterialCards, type SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesMaterialDetailDialog } from './SalesMaterialDetailDialog';
import { SalesLibrarySelect } from './SalesLibrarySelect';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: vi.fn(),
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
  },
}));
vi.mock('../api/salesMaterials', () => ({ updateSalesSound: vi.fn(), updateSalesMaterial: vi.fn(), deleteSalesMaterial: vi.fn(), deleteSalesSound: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => {
      if (isValidElement<Record<string, unknown>>(child)) queue.push(child);
    });
  }
  throw new Error('Control not found');
}
const card = salesMaterialCards({ personas: [], scenes: [], actions: [], voices: [], bgms: [{
  id: 'bgm_custom_test', title: '轻快配乐', description: '', moodTags: ['轻快'], bpm: 120,
  license: '自有上传配乐', durationSec: 15, suitableCategories: [], audioUrl: '/bgm.mp3',
}] })[0];
function render(value = card) {
  hooks.index = 0;
  return SalesMaterialDetailDialog({ card: value, images: [], onClose: vi.fn(), onChanged: vi.fn() });
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.clearAllMocks(); });

it('does not write display-only BPM and license labels back into music mood tags', async () => {
  expect(card.tags).toEqual(['轻快', '120 BPM', '自有上传配乐']);
  const edit = find(render(), (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('编辑'));
  (edit.props.onClick as () => void)();
  const tags = find(render(), (node) => node.type === 'input' && node.props.maxLength === 300);
  expect(tags.props.value).toBe('轻快');
  const form = find(render(), (node) => node.type === 'form');
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(updateSalesSound).toHaveBeenCalledWith(card.id, expect.objectContaining({ moodTags: ['轻快'], tags: ['轻快'] })));
});

it('keeps edited sound fields available after saving fails and sends them again on retry', async () => {
  vi.mocked(updateSalesSound).mockRejectedValueOnce(new Error('资产库暂不可用')).mockResolvedValueOnce(undefined);
  const edit = find(render(), (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('编辑'));
  (edit.props.onClick as () => void)();
  const tags = find(render(), (node) => node.type === 'input' && node.props.maxLength === 300);
  (tags.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '轻快，自然' } });
  const submit = () => (find(render(), (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  submit();
  await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert').props.children).toBe('资产库暂不可用'));
  expect(find(render(), (node) => node.type === 'input' && node.props.maxLength === 300).props.value).toBe('轻快，自然');
  submit();
  await vi.waitFor(() => expect(updateSalesSound).toHaveBeenCalledTimes(2));
  expect(updateSalesSound).toHaveBeenLastCalledWith(card.id, expect.objectContaining({ moodTags: ['轻快', '自然'] }));
});

const action: SalesMaterialCard = { id: 'action', key: 'action:action', kind: 'action', title: '展示', description: '', tags: [], image: '', audio: '', badge: '动作图片', categoryId: 'first', productCategoryIds: ['first', 'second'] };
function editAction() {
  const edit = find(render(action), (node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('编辑资料'));
  (edit.props.onClick as () => void)();
}
function submitAction() {
  (find(render(action), (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
}

it('preserves all category assignments when only renaming an action', async () => {
  editAction();
  const name = find(render(action), (node) => node.type === 'input' && node.props.maxLength === 80);
  (name.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '转身展示' } });
  submitAction();
  await vi.waitFor(() => expect(updateSalesMaterial).toHaveBeenCalledExactlyOnceWith('action', action.id, { title: '转身展示' }));
});

it('clears categories only when the user explicitly selects unclassified', async () => {
  editAction();
  const category = find(render(action), (node) => node.type === SalesLibrarySelect && node.props.label === '编辑动作商品类目');
  expect(category.props.options).toContainEqual({ value: 'first', label: '原分类未读取' });
  (category.props.onChange as (value: string) => void)('');
  submitAction();
  await vi.waitFor(() => expect(updateSalesMaterial).toHaveBeenCalledExactlyOnceWith('action', action.id, { title: action.title, productCategoryIds: '[]' }));
});
