import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MaterialLibraryView from './MaterialLibraryView';
import MaterialProjectDetailView from './MaterialProjectDetailView';
import MaterialLibraryToolbar from './MaterialLibraryToolbar';
import MaterialProjectView from './MaterialProjectView';
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
vi.mock('@client/shared/media/widgets/Folder', () => ({ Folder: () => null }));
vi.mock('../dialogs/AssetMediaPreview', () => ({ default: () => null }));
vi.mock('@client/shared/ui/agentDocumentBus', () => ({ openAgentDocument: vi.fn() }));

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
    sessions: [{ id: 's', title: '项目', createdAt: 1, tasks: [] }], canvasProjects: [],
    mergedTasks: [{ id: 'generated', sessionId: 's', resultUrl: '/generated.png', referenceImageUrl: '/reference.png' }, { id: 'upload', sessionId: 's', isUploaded: true, resultUrl: '/upload.png' }],
    sourceType: 'ai' as 'ai' | 'uploaded', onSourceTypeChange: vi.fn(), setPreviewTask: vi.fn(),
    onBatchDelete: vi.fn().mockResolvedValue(true), onBatchDownload: vi.fn(), onBatchDeleteProjects: vi.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  hooks.index = 0; hooks.values = []; hooks.effects = [];
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('material library interactions', () => {
  it('shares one project list between cards, counts, selection and batch deletion', async () => {
    const input = props();
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onViewModeChange('project');
    view = Render(() => MaterialLibraryView(input));
    const projects = child(view, MaterialProjectView).props.projects;
    expect(projects[0]).toMatchObject({ id: 's', assetCount: 1 });
    expect(child(view, MaterialLibraryToolbar).props.totalCount).toBe(projects.length);
    child(view, MaterialLibraryToolbar).props.onToggleSelectAll();
    view = Render(() => MaterialLibraryView(input));
    await child(view, MaterialFloatingDock).props.onBatchDelete();
    expect(input.onBatchDeleteProjects).toHaveBeenCalledWith(projects);
    expect(child(Render(() => MaterialLibraryView(input)), MaterialFloatingDock).props.selectedCount).toBe(0);
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

  it('passes the controlled source and source changes through to project details', () => {
    const input = props();
    let view = Render(() => MaterialLibraryView(input));
    child(view, MaterialLibraryToolbar).props.onViewModeChange('project');
    view = Render(() => MaterialLibraryView(input));
    const projectView = child(view, MaterialProjectView);
    projectView.props.onSelectProject(projectView.props.projects[0]);
    input.sourceType = 'uploaded';
    view = Render(() => MaterialLibraryView(input));
    expect(view.type).toBe(MaterialProjectDetailView);
    const detail = child(view, MaterialProjectDetailView);
    expect(detail.props.sourceType).toBe('uploaded');
    detail.props.onSourceTypeChange('ai');
    expect(input.onSourceTypeChange).toHaveBeenCalledWith('ai');
    expect(detail.props.project.assetCount).toBe(1);
  });
});

describe('project detail interactions', () => {
  it('uses the outer source immediately and forwards the inner source switch', () => {
    const input = props();
    const view = Render(() => MaterialProjectDetailView({ ...input, sourceType: 'uploaded', project: { id: 's', type: 'session', title: '项目', photos: [], assetCount: 1 }, onBack: vi.fn() }));
    expect(nodes(view).some((node) => node.props.src === '/generated.png')).toBe(false);
    expect(nodes(view).some((node) => node.props.src === '/upload.png')).toBe(true);
    const aiButton = nodes(view).find((node) => node.type === 'button' && node.props.children === 'AI 生成');
    (aiButton!.props.onClick as () => void)();
    expect(input.onSourceTypeChange).toHaveBeenCalledWith('ai');
  });
});
