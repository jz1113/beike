import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssetActions } from './useAssetActions';
import { useAssetHistoryQuery } from './useAssetHistoryQuery';
import { useMaterialSelection } from '../components/material/MaterialLibraryView';
import { getNextAssetPage } from '@client/shared/utils/assetTaskData';
import { permanentDeleteGeneration } from '@client/shared/api/permanentDeleteGeneration';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { exportZipDownload } from '@client/shared/api/exportZipDownload';

const hooks = vi.hoisted(() => ({
  index: 0,
  state: [] as unknown[],
  effects: [] as (() => void)[],
  hidden: false,
  query: { fetchNextPage: vi.fn(), hasNextPage: true, isFetching: false, isError: false, refetch: vi.fn(), data: undefined },
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => void) => hooks.effects.push(fn),
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.state)) hooks.state[index] = initial;
    return [hooks.state[index], (next: T | ((previous: T) => T)) => {
      hooks.state[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.state[index] as T) : next;
    }];
  },
}));
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: () => hooks.query, useQueryClient: () => ({}) }));
vi.mock('@client/shared/api/generation/generationApi', () => ({ fetchAssetTasks: vi.fn() }));
vi.mock('@client/shared/hooks/useSafeTimeout', () => ({ useDocumentHidden: () => hooks.hidden }));
vi.mock('@client/shared/api/permanentDeleteGeneration', () => ({ permanentDeleteGeneration: vi.fn() }));
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('@client/shared/api/exportZipDownload', () => ({ exportZipDownload: vi.fn(), formatExportProgress: vi.fn() }));

function Harness(overrides: Partial<Parameters<typeof useAssetActions>[0]> = {}) {
  hooks.index = 0;
  const params = {
    mergedTasks: [{ id: 'db-1', dbId: 'db-1', sessionId: 'session-1', resultUrl: '/image.png' }],
    canvasProjects: [{ id: 'c', title: '画布', createdAt: 1, updatedAt: 1, nodes: [{ id: 'n', type: 'image', imageUrl: '/image.png' }] }],
    onDeleteCanvasProject: vi.fn(), onDeleteCanvasNode: vi.fn(), deleteSession: vi.fn(),
    serverHistoryComplete: true, selectedTaskIds: [], failedTasks: [], setSelectedTaskIds: vi.fn(), setIsBatchMode: vi.fn(), showToast: vi.fn(), refetchAssetTasks: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { params, actions: useAssetActions(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.index = 0;
  hooks.state = [];
  hooks.effects = [];
  hooks.hidden = false;
  Object.assign(hooks.query, { hasNextPage: true, isFetching: false, isError: false });
  vi.mocked(confirmAction).mockResolvedValue(true);
  vi.mocked(permanentDeleteGeneration).mockResolvedValue({ ok: true, ids: ['db-1'], urls: [] });
  vi.mocked(exportZipDownload).mockResolvedValue({ partial: false, succeeded: 1, failed: 0, savedVia: 'browser', total: 1 });
});

describe('media deletion', () => {
  it('acknowledges a completed delete even when the following history refresh fails', async () => {
    const { actions, params } = Harness();
    vi.mocked(params.refetchAssetTasks).mockRejectedValue(new Error('刷新失败'));
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(true);
    expect(params.setSelectedTaskIds).toHaveBeenCalledWith([]);
    expect(params.showToast).not.toHaveBeenCalledWith(expect.stringContaining('删除未全部完成'));
  });

  it('returns false and keeps selection after cancellation or failed deletion', async () => {
    const { actions, params } = Harness();
    vi.mocked(confirmAction).mockResolvedValueOnce(false);
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(false);
    vi.mocked(permanentDeleteGeneration).mockResolvedValueOnce({ ok: false, ids: [], urls: [], error: '失败' });
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(false);
    expect(params.setSelectedTaskIds).not.toHaveBeenCalled();
  });

  it.each(['SUCCESS', 'FAILURE'])('deletes a canvas generation archive through the server (%s)', async (status) => {
    const task = { id: 'db-1', dbId: 'db-1', canvasProjectId: 'c', status };
    const { actions, params } = Harness({ mergedTasks: [task] });
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(true);
    expect(permanentDeleteGeneration).toHaveBeenCalledWith([task], { protectUrls: ['/image.png'] });
    expect(params.refetchAssetTasks).toHaveBeenCalledOnce();
    expect(params.onDeleteCanvasNode).not.toHaveBeenCalled();
    expect(params.onDeleteCanvasProject).not.toHaveBeenCalled();
  });

  it('deletes a local canvas generation without treating its project association as a node', async () => {
    const task = { id: 'local-task', canvasProjectId: 'c', status: 'FAILURE' };
    const { actions, params } = Harness({ mergedTasks: [task] });
    expect(await actions.handleBatchDeleteTasks(['local-task'])).toBe(true);
    expect(permanentDeleteGeneration).toHaveBeenCalledWith([task], expect.anything());
    expect(params.onDeleteCanvasNode).not.toHaveBeenCalled();
  });

  it('keeps archive deletion separate from concrete canvas node deletion in a mixed batch', async () => {
    const archived = { id: 'db-1', dbId: 'db-1', canvasProjectId: 'c', nodeId: 'source-node' };
    const node = { id: 'canvas-c-n', canvasProjectId: 'c', nodeId: 'n' };
    const { actions, params } = Harness({ mergedTasks: [archived, node] });
    expect(await actions.handleBatchDeleteTasks(['db-1', 'canvas-c-n'])).toBe(true);
    expect(permanentDeleteGeneration).toHaveBeenCalledWith([archived], expect.anything());
    expect(params.onDeleteCanvasNode).toHaveBeenCalledExactlyOnceWith('c', 'n');
    expect(params.refetchAssetTasks).toHaveBeenCalledOnce();
  });

  it('does not report success or clear selection when a canvas-associated archive cannot be deleted', async () => {
    const task = { id: 'db-1', dbId: 'db-1', canvasProjectId: 'c' };
    vi.mocked(permanentDeleteGeneration).mockResolvedValueOnce({ ok: false, ids: [], urls: [], error: '服务端拒绝删除' });
    const { actions, params } = Harness({ mergedTasks: [task] });
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(false);
    expect(params.setSelectedTaskIds).not.toHaveBeenCalled();
    expect(params.showToast).toHaveBeenCalledWith(expect.stringContaining('删除未全部完成'));
    expect(params.onDeleteCanvasNode).not.toHaveBeenCalled();
  });

  it('deletes a real canvas node called cover without deleting the entire project', async () => {
    const { actions, params } = Harness({ mergedTasks: [{ id: 'canvas-cover', canvasProjectId: 'c', nodeId: 'cover' }] });
    expect(await actions.handleBatchDeleteTasks(['canvas-cover'])).toBe(true);
    expect(params.onDeleteCanvasNode).toHaveBeenCalledWith('c', 'cover');
    expect(params.onDeleteCanvasProject).not.toHaveBeenCalled();
    expect(permanentDeleteGeneration).not.toHaveBeenCalled();
  });
});

function RunHistoryEffect(enabled = true) {
  hooks.index = 0;
  hooks.effects = [];
  useAssetHistoryQuery(enabled);
  hooks.effects[0]();
}

describe('asset history pagination', () => {
  it('requests the next history page without cancelling a refresh already in progress', () => {
    RunHistoryEffect();
    expect(hooks.query.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
  });

  it('continues after each page and stops after the last page', () => {
    RunHistoryEffect();
    hooks.query.isFetching = true;
    RunHistoryEffect();
    expect(hooks.query.fetchNextPage).toHaveBeenCalledTimes(1);
    hooks.query.isFetching = false;
    RunHistoryEffect();
    expect(hooks.query.fetchNextPage).toHaveBeenCalledTimes(2);
    hooks.query.hasNextPage = false;
    RunHistoryEffect();
    expect(hooks.query.fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it.each(['inactive', 'hidden', 'error', 'fetching', 'complete'])('pauses loading when %s', (reason) => {
    if (reason === 'hidden') hooks.hidden = true;
    if (reason === 'error') hooks.query.isError = true;
    if (reason === 'fetching') hooks.query.isFetching = true;
    if (reason === 'complete') hooks.query.hasNextPage = false;
    RunHistoryEffect(reason !== 'inactive');
    expect(hooks.query.fetchNextPage).not.toHaveBeenCalled();
  });

  it('resumes pagination once a failed query is refreshed successfully', () => {
    hooks.query.isError = true;
    RunHistoryEffect();
    hooks.query.isError = false;
    RunHistoryEffect();
    expect(hooks.query.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('uses server totals to reach history beyond 40 records and stops on an empty response', () => {
    expect(getNextAssetPage({ tasks: Array(40), total: 81 }, 1)).toBe(2);
    expect(getNextAssetPage({ tasks: Array(40), total: 81 }, 2)).toBe(3);
    expect(getNextAssetPage({ tasks: [{}], total: 81 }, 3)).toBeUndefined();
    expect(getNextAssetPage({ tasks: [], total: 81 }, 2)).toBeUndefined();
  });
});

function RenderSelection(ids = ['a', 'b'], scope = 'flat:ai', flush = true) {
  hooks.index = 0;
  hooks.effects = [];
  const selection = useMaterialSelection(ids.map((id) => ({ id })), scope);
  if (flush) hooks.effects.forEach((effect) => effect());
  return selection;
}

describe('material selection', () => {
  it('only selects visible IDs and stops a card click from opening the preview', () => {
    const selection = RenderSelection();
    const event = { stopPropagation: vi.fn() };
    selection.toggle('a', event);
    selection.toggle('hidden');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(RenderSelection().ids).toEqual(['a']);
  });

  it('excludes hidden IDs immediately, before effects run', () => {
    RenderSelection().toggle('a');
    expect(RenderSelection(['b'], 'flat:ai', false).ids).toEqual([]);
  });

  it('prunes removed items so they are not selected if they later reappear', () => {
    RenderSelection().toggleAll();
    expect(RenderSelection(['b']).ids).toEqual(['b']);
    expect(RenderSelection().ids).toEqual(['b']);
  });

  it.each(['flat:uploaded', 'flat:ai:video', 'flat:ai:search', 'project:ai', 'project:s2'])('clears selection when filter or project scope changes to %s', (scope) => {
    RenderSelection().toggle('a');
    expect(RenderSelection(['a', 'b'], scope).ids).toEqual([]);
    expect(RenderSelection().ids).toEqual([]);
  });

  it('selects all by membership even when a previous selection has the same count', () => {
    RenderSelection(['a']).toggleAll();
    const changed = RenderSelection(['b'], 'flat:ai', false);
    changed.toggleAll();
    expect(RenderSelection(['b']).ids).toEqual(['b']);
    RenderSelection(['b']).toggleAll();
    expect(RenderSelection(['b']).ids).toEqual([]);
  });

  it('clears selection on successful completion while supporting a failed operation retry', () => {
    RenderSelection().toggleAll();
    expect(RenderSelection().ids).toEqual(['a', 'b']);
    RenderSelection().clear();
    expect(RenderSelection().ids).toEqual([]);
  });
});
