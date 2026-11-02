import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import { SalesMaterialWorkspace } from './SalesMaterialWorkspace';
import { SalesImageImportDialog } from './SalesImageImportDialog';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as Array<() => unknown> }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(), useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
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
vi.mock('../api/salesProduction', () => ({ fetchSalesStudioAssets: vi.fn() }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => 'test-workspace' }));
vi.mock('../model/salesAssetDraft', async (original) => ({ ...await original<typeof import('../model/salesAssetDraft')>(), readSalesAssetDraft: () => null }));

type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node | undefined {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactNode, (child) => { if (isValidElement<Record<string, unknown>>(child)) queue.push(child); });
  }
}
function render(section: 'persona' | 'scene') {
  hooks.index = 0; hooks.effects = [];
  return SalesMaterialWorkspace({ section, onSectionChange: vi.fn(), promptContent: null, promptsUnsaved: false });
}
function replayEffects() { hooks.effects.forEach((effect) => effect()); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = []; vi.resetAllMocks();
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], actions: [], voices: [], bgms: [] });
});

describe('batch asset import workspace entry', () => {
  it.each([
    { kind: 'persona' as const, label: '人物', categoryLabel: '成年男', categoryProp: 'personaGroup', categoryValue: 'male' },
    { kind: 'scene' as const, label: '场景', categoryLabel: '室内', categoryProp: 'sceneSpace', categoryValue: 'indoor' },
  ])('imports into the selected $kind category and refreshes after partial success', async ({ kind, label, categoryLabel, categoryProp, categoryValue }) => {
    const entry = () => find(render(kind), (node) => node.type === 'button' && Children.toArray(node.props.children as ReactNode).filter((child) => typeof child === 'string').join('') === `批量导入${label}`)!;
    expect(entry().props.disabled).toBe(true);
    render(kind); replayEffects(); await Promise.resolve();
    const categoryButton = () => find(render(kind), (node) => node.type === 'button' && node.props.title === categoryLabel)!;
    (categoryButton().props.onClick as () => void)();
    await vi.waitFor(() => expect(entry().props.disabled).toBe(false));
    (entry().props.onClick as () => void)();
    const dialog = find(render(kind), (node) => node.type === SalesImageImportDialog)!;
    expect(dialog.props[categoryProp]).toBe(categoryValue);
    expect(dialog.props.existingNames).toEqual([]);
    (dialog.props.onImported as (count: number) => void)(2);
    expect(find(render(kind), (node) => node.type === SalesImageImportDialog)).toBeDefined();
    replayEffects(); await Promise.resolve();
    expect(fetchSalesStudioAssets).toHaveBeenCalledTimes(2);
    (dialog.props.onClose as () => void)();
    expect(find(render(kind), (node) => node.type === SalesImageImportDialog)).toBeUndefined();
    expect(categoryButton().props['aria-current']).toBe('true');
  });
});
