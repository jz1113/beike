import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import { SalesScriptQuickClassify } from './SalesScriptQuickClassify';
import { SalesScriptTaxonomyFields } from './SalesScriptTaxonomyFields';

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
    return [hooks.slots[index], (value: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof value === 'function' ? (value as (previous: T) => T)(hooks.slots[index] as T) : value;
    }];
  },
}));

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
const script = normalizeScriptTemplate({ title: '参考', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '展示' }] }] })!;
const item: StoredSalesScript = { id: 's', title: '参考', videoUrl: '', videoHash: '', status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' };
const items = ['old', 'new'].map((id) => ({ id, kind: 'category' as const, name: id, sortOrder: 0, createdAt: '', updatedAt: '' }));
const save = vi.fn();
const close = vi.fn();
const create = vi.fn();
function render(categoryId = 'old', styleId = '') {
  hooks.index = 0;
  return SalesScriptQuickClassify({ item: { ...item, script: { ...script, taxonomy: { ...script.taxonomy, categoryId, styleId } } }, items, loading: false, onManage: vi.fn(), onCreateTaxonomy: create, onSave: save, onClose: close });
}
function fields() { return find(render(), (node) => node.type === SalesScriptTaxonomyFields).props; }
function persist() { (find(render(), (node) => node.type === 'button' && String(node.props.className).includes('sales-collect-primary')).props.onClick as () => void)(); }
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.resetAllMocks(); save.mockResolvedValue(true); });

it('uses a modal and saves category and style only after explicit confirmation', async () => {
  expect(render().type).toBe('dialog');
  (fields().onChange as (patch: { categoryId: string }) => void)({ categoryId: 'new' });
  expect(save).not.toHaveBeenCalled();
  persist();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 's' }), 'new', '');
});

it('keeps selections after a failed save and allows retry', async () => {
  save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  (fields().onChange as (patch: { categoryId: string }) => void)({ categoryId: 'new' });
  persist();
  await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert').props.children).toContain('未保存'));
  expect(close).not.toHaveBeenCalled();
  expect(fields().value).toMatchObject({ categoryId: 'new' });
  persist();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('retains newly created IDs before a catalog refresh and prevents duplicate saves or early close', async () => {
  create.mockResolvedValue({ id: 'created', kind: 'category', name: '新分类' });
  await (fields().onCreate as (kind: string, name: string) => Promise<unknown>)('category', '新分类');
  let resolve!: (ok: boolean) => void;
  save.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
  persist(); persist();
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 's' }), 'created', '');
  (render().props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  expect(close).not.toHaveBeenCalled();
  resolve(true);
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('canceling closes the dialog without changing the script', () => {
  (fields().onChange as (patch: { categoryId: string }) => void)({ categoryId: 'new' });
  (render().props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  expect(close).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it('preserves existing taxonomy IDs when the catalog does not contain them', async () => {
  render('unloaded-category', 'unloaded-style');
  persist();
  await vi.waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 's' }), 'unloaded-category', 'unloaded-style'));
});

it('allows an explicit unclassified selection to clear an unknown category without clearing its style', async () => {
  render('unloaded-category', 'unloaded-style');
  (fields().onChange as (patch: { categoryId: string }) => void)({ categoryId: '' });
  persist();
  await vi.waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 's' }), '', 'unloaded-style'));
});
