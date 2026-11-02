import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { salesAtlasCatalogResponseSchema, type SalesAtlasImportResponse } from '@shared/contracts/salesAtlas';
import { fetchSalesAtlasCatalog, importSalesAtlasItems } from '../../api/salesAtlas';
import { AtlasHubDrawer } from './AtlasHubDrawer';
import { AtlasHubToolbar } from './AtlasHubToolbar';
import { AtlasVirtualGrid } from './AtlasVirtualGrid';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as Array<() => unknown> }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../../api/salesAtlas', () => ({ fetchSalesAtlasCatalog: vi.fn(), importSalesAtlasItems: vi.fn() }));

const catalog = salesAtlasCatalogResponseSchema.parse({
  success: true, synced: true,
  faces: { items: [{ id: 'face-1', section: 'face', hair: 'short', style: '自然', thumbUrl: '/face-thumb.jpg', fullUrl: '/face.jpg' }] },
});
const imported: SalesAtlasImportResponse = { success: true, kind: 'face', imported: 1, skipped: 0, importedIds: ['face-1'] };
type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node | undefined {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactNode, (child) => {
      if (isValidElement<Record<string, unknown>>(child)) queue.push(child);
    });
  }
}
function renderedText(children: ReactNode): string {
  return Children.toArray(children).map((child) => isValidElement<{ children?: ReactNode }>(child)
    ? renderedText(child.props.children) : String(child)).join('');
}
function button(root: Node, label: string | RegExp) {
  return find(root, (node) => node.type === 'button' && (typeof label === 'string'
    ? renderedText(node.props.children as ReactNode).includes(label) : label.test(renderedText(node.props.children as ReactNode))))!;
}
function render(patch: Partial<Parameters<typeof AtlasHubDrawer>[0]> = {}) {
  hooks.index = 0; hooks.effects = [];
  return AtlasHubDrawer({ open: true, onClose: vi.fn(), ...patch });
}
function toolbar(root = render()) { return find(root, (node) => node.type === AtlasHubToolbar)!; }
function grid(root = render()) { return find(root, (node) => node.type === AtlasVirtualGrid)!; }
async function load(patch: Partial<Parameters<typeof AtlasHubDrawer>[0]> = {}) {
  render(patch); hooks.effects.forEach((effect) => effect());
  await vi.waitFor(() => expect(grid(render(patch))?.props.faces).toEqual(catalog.faces!.items));
}

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = [];
  vi.resetAllMocks();
  vi.mocked(fetchSalesAtlasCatalog).mockResolvedValue(catalog);
  vi.mocked(importSalesAtlasItems).mockResolvedValue(imported);
});

describe('atlas catalog recovery and import controls', () => {
  it('offers an explicit retry after the first read fails and restores the catalog on retry', async () => {
    vi.mocked(fetchSalesAtlasCatalog).mockRejectedValueOnce(new Error('图鉴网络中断')).mockResolvedValueOnce(catalog);
    render(); hooks.effects.forEach((effect) => effect());
    await vi.waitFor(() => expect(button(render(), '重新读取图鉴')).toBeDefined());
    const failed = render();
    expect(renderedText(failed)).toContain('图鉴网络中断');
    expect(find(failed, (node) => node.props.role === 'alert')).toBeDefined();
    expect(find(failed, (node) => node.type === AtlasVirtualGrid)).toBeUndefined();
    expect(renderedText(failed)).not.toContain('暂无匹配');
    expect(importSalesAtlasItems).not.toHaveBeenCalled();
    (button(failed, '重新读取图鉴').props.onClick as () => void)();
    await vi.waitFor(() => expect(grid()?.props.faces).toEqual(catalog.faces!.items));
    expect(fetchSalesAtlasCatalog).toHaveBeenCalledTimes(2);
    expect(button(render(), '重新读取图鉴')).toBeUndefined();
  });

  it.each(['single', 'batch'])('disables filters and grid actions during a %s import, then unlocks them', async (mode) => {
    let completeImport!: (result: SalesAtlasImportResponse) => void;
    vi.mocked(importSalesAtlasItems).mockImplementation(() => new Promise((resolve) => { completeImport = resolve; }));
    await load();
    expect(toolbar().props.disabled).toBe(false);
    expect(grid().props.disabled).toBe(false);
    if (mode === 'single') (grid().props.onImportOne as (id: string) => void)('face-1');
    else {
      (grid().props.onToggleSelect as (id: string) => void)('face-1');
      (button(render(), /一键批量迁入|批量导入/).props.onClick as () => void)();
    }
    expect(toolbar().props.disabled).toBe(true);
    expect(grid().props.disabled).toBe(true);
    expect(importSalesAtlasItems).toHaveBeenCalledWith(expect.objectContaining({ kind: 'face', ids: ['face-1'] }));
    completeImport(imported);
    await vi.waitFor(() => expect(toolbar().props.disabled).toBe(false));
    expect(grid().props.disabled).toBe(false);
  });

  it('inherits the requested male audience and uses it for imports', async () => {
    const patch = { defaultFaceAudience: 'adult_male' as const };
    await load(patch);
    expect(toolbar(render(patch)).props.faceAudience).toBe('adult_male');
    expect(grid(render(patch)).props.density).toBe('sm');
    (grid(render(patch)).props.onImportOne as (id: string) => void)('face-1');
    await vi.waitFor(() => expect(importSalesAtlasItems).toHaveBeenCalledWith(expect.objectContaining({ audience: 'adult_male' })));
  });

  it('retains successful chunks and retries only the remaining selection after a partial batch failure', async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `face-${index + 1}`);
    const firstChunk = ids.slice(0, 60), remaining = ids.slice(60);
    const manyFaces = ids.map((id) => ({ ...catalog.faces!.items[0], id }));
    vi.mocked(fetchSalesAtlasCatalog).mockResolvedValue({ ...catalog, faces: { ...catalog.faces!, items: manyFaces } });
    vi.mocked(importSalesAtlasItems)
      .mockResolvedValueOnce({ ...imported, imported: 60, importedIds: firstChunk })
      .mockRejectedValueOnce(new Error('末批请求失败'))
      .mockResolvedValueOnce({ ...imported, importedIds: remaining });
    const onImported = vi.fn(), patch = { onImported };
    render(patch); hooks.effects.forEach((effect) => effect());
    await vi.waitFor(() => expect(grid(render(patch))?.props.faces).toHaveLength(61));
    const select = grid(render(patch)).props.onToggleSelect as (id: string) => void;
    ids.forEach(select);
    (button(render(patch), /批量导入/).props.onClick as () => void)();
    await vi.waitFor(() => {
      expect(importSalesAtlasItems).toHaveBeenCalledTimes(2);
      expect(grid(render(patch)).props.disabled).toBe(false);
    });
    expect(importSalesAtlasItems).toHaveBeenNthCalledWith(1, expect.objectContaining({ ids: firstChunk }));
    expect(importSalesAtlasItems).toHaveBeenNthCalledWith(2, expect.objectContaining({ ids: remaining }));
    expect(grid(render(patch)).props.importedIds).toEqual(new Set(firstChunk));
    expect(grid(render(patch)).props.selectedIds).toEqual(new Set(remaining));
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ count: 60, message: '已完成 60 项，其余选中项可重试。' }));
    expect(renderedText(render(patch))).toContain('末批请求失败');
    (button(render(patch), /批量导入/).props.onClick as () => void)();
    await vi.waitFor(() => expect(onImported).toHaveBeenCalledTimes(2));
    expect(importSalesAtlasItems).toHaveBeenCalledTimes(3);
    expect(importSalesAtlasItems).toHaveBeenNthCalledWith(3, expect.objectContaining({ ids: remaining }));
    expect(grid(render(patch)).props.importedIds).toEqual(new Set(ids));
    expect(grid(render(patch)).props.selectedIds).toEqual(new Set());
    expect(onImported).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
  });
});
