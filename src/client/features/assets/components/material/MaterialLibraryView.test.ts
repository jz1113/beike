import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MaterialLibraryView from './MaterialLibraryView';
import type { MergedAssetTask } from '../../model/agentAssetFilter';
import MaterialLibraryToolbar from './MaterialLibraryToolbar';
import MaterialAssetCard from './MaterialAssetCard';
import MaterialFloatingDock from './MaterialFloatingDock';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[], effects: [] as (() => void)[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (fn: () => void) => hooks.effects.push(fn),
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.values[index], (next: T | ((previous: T) => T)) => {
      hooks.values[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.values[index] as T) : next;
    }];
  },
}));
vi.mock('@client/shared/i18n', async (original) => ({ ...await original<typeof import('@client/shared/i18n')>(), useI18n: () => ({ t: (key: string) => key, locale: 'zh-CN' }) }));
vi.mock('../dialogs/AssetMediaPreview', () => ({ default: () => null }));
vi.mock('@client/shared/ui/AppErrorBoundary', () => ({ openAgentDocument: vi.fn() }));

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function child<T>(view: ReactNode, type: T): ReactElement<T extends (props: infer P) => unknown ? P : never> {
  const element = nodes(view).find((node) => node.type === type);
  expect(element).toBeDefined();
  return element as ReturnType<typeof child<T>>;
}
function Render<T>(component: () => T) {
  hooks.index = 0;
  hooks.effects = [];
  const view = component();
  hooks.effects.forEach((effect) => effect());
  return view;
}
function props() {
  return {
    mergedTasks: [{ id: 'generated', sessionId: 's', resultUrl: '/generated.png', referenceImageUrl: '/reference.png' }, { id: 'upload', sessionId: 's', isUploaded: true, resultUrl: '/upload.png' }] as MergedAssetTask[],
    sourceType: 'ai' as 'ai' | 'uploaded', setPreviewTask: vi.fn(),
    onBatchDelete: vi.fn().mockResolvedValue(true), onBatchDownload: vi.fn(),
  };
}

beforeEach(() => {
  hooks.index = 0; hooks.values = []; hooks.effects = [];
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('material library interactions', () => {
  it('hides unavailable images and empty groups, clears selection, and allows replacement URLs', async () => {
    const input = props();
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    view = Render(() => MaterialLibraryView(input));
    child(view, MaterialAssetCard).props.onImageUnavailable?.('/generated.png');
    view = Render(() => MaterialLibraryView(input));
    expect(nodes(view).filter(node => node.type === MaterialAssetCard)).toHaveLength(0);
    expect(nodes(view).filter(node => node.type === 'section')).toHaveLength(0);
    expect(child(view, MaterialLibraryToolbar).props.totalCount).toBe(0);
    expect(child(view, MaterialFloatingDock).props.selectedCount).toBe(0);
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    expect(input.onBatchDelete).toHaveBeenCalledWith([]);
    input.mergedTasks[0] = { ...input.mergedTasks[0], resultUrl: '/replacement.png' };
    view = Render(() => MaterialLibraryView(input));
    expect(child(view, MaterialLibraryToolbar).props.totalCount).toBe(1);
    expect(child(view, MaterialAssetCard).props.task.resultUrl).toBe('/replacement.png');
  });

  it('excludes failures from cards, counts, selection, downloads and previews', () => {
    const input = props();
    input.mergedTasks.push({ id: 'failed', sessionId: 's', resultUrl: '/failed.png', status: 'FAILURE' });
    let view = Render(() => MaterialLibraryView(input));
    expect(nodes(view).filter(node => node.type === MaterialAssetCard)).toHaveLength(1);
    expect(child(view, MaterialLibraryToolbar).props.totalCount).toBe(1);
    child(view, MaterialAssetCard).props.onClick(input.mergedTasks[0]);
    expect(input.setPreviewTask).toHaveBeenCalledWith(input.mergedTasks[0], [input.mergedTasks[0]]);
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    view = Render(() => MaterialLibraryView(input));
    child(view, MaterialFloatingDock).props.onBatchDownload?.();
    expect(input.onBatchDownload).toHaveBeenCalledWith(['generated']);
  });

  it('does not delete hidden selected media after source changes', async () => {
    const input = props();
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    expect(child(Render(() => MaterialLibraryView(input)), MaterialFloatingDock).props.selectedCount).toBe(1);
    input.sourceType = 'uploaded';
    view = Render(() => MaterialLibraryView(input));
    expect(child(view, MaterialFloatingDock).props.selectedCount).toBe(0);
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    expect(input.onBatchDelete).toHaveBeenCalledWith([]);
  });

  it('preserves selection after cancelled deletion and clears it after success', async () => {
    const input = props();
    input.onBatchDelete.mockResolvedValueOnce(false);
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    view = Render(() => MaterialLibraryView(input));
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    view = Render(() => MaterialLibraryView(input));
    expect(child(view, MaterialFloatingDock).props.selectedCount).toBe(1);
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    expect(child(Render(() => MaterialLibraryView(input)), MaterialFloatingDock).props.selectedCount).toBe(0);
  });

  it('renders a flat grid without a view selector', () => {
    const view = Render(() => MaterialLibraryView(props()));
    expect(nodes(view).some(node => node.type === 'select')).toBe(false);
    expect(nodes(view).filter(node => node.type === MaterialAssetCard)).toHaveLength(1);
  });

  it('removes a selected task from actions as soon as it fails', async () => {
    const input = props();
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    input.mergedTasks[0] = { ...input.mergedTasks[0], status: 'FAILURE' };
    view = Render(() => MaterialLibraryView(input));
    expect(child(view, MaterialLibraryToolbar).props.totalCount).toBe(0);
    expect(child(view, MaterialFloatingDock).props.selectedCount).toBe(0);
    expect(nodes(view).some(node => node.type === MaterialAssetCard)).toBe(false);
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    expect(input.onBatchDelete).toHaveBeenCalledWith([]);
  });
});
