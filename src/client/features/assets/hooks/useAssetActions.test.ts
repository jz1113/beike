import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssetActions } from './useAssetActions';
import { permanentDeleteGeneration } from '@client/shared/api/permanentDeleteGeneration';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { exportZipDownload } from '@client/shared/api/exportZipDownload';
import type { ProjectFolderItem } from '../model/materialProjects';

vi.mock('react', () => ({ useState: (value: unknown) => [value, vi.fn()], useRef: (current: unknown) => ({ current }) }));
vi.mock('@client/shared/api/permanentDeleteGeneration', () => ({ permanentDeleteGeneration: vi.fn() }));
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('@client/shared/api/exportZipDownload', () => ({ exportZipDownload: vi.fn(), formatExportProgress: vi.fn() }));

const project: ProjectFolderItem = { id: 'session-1', title: '项目', type: 'session', assetCount: 1, photos: [] };
function Harness(overrides: Partial<Parameters<typeof useAssetActions>[0]> = {}) {
  const params = {
    mergedTasks: [{ id: 'db-1', dbId: 'db-1', sessionId: project.id, resultUrl: '/image.png' }],
    canvasProjects: [{ id: 'c', title: '画布', createdAt: 1, updatedAt: 1, nodes: [{ id: 'n', type: 'image', imageUrl: '/image.png' }] }],
    onDeleteCanvasProject: vi.fn(), onDeleteCanvasNode: vi.fn(), deleteSession: vi.fn(),
    serverHistoryComplete: true, selectedTaskIds: [], failedTasks: [], setSelectedTaskIds: vi.fn(), setIsBatchMode: vi.fn(), showToast: vi.fn(), refetchAssetTasks: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { params, actions: useAssetActions(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirmAction).mockResolvedValue(true);
  vi.mocked(permanentDeleteGeneration).mockResolvedValue({ ok: true, ids: ['db-1'], urls: [] });
  vi.mocked(exportZipDownload).mockResolvedValue({ partial: false, succeeded: 1, failed: 0, savedVia: 'browser', total: 1 });
});

describe('project deletion', () => {
  it.each([false, true])('keeps a session when server deletion fails (partial=%s)', async (partial) => {
    vi.mocked(permanentDeleteGeneration).mockResolvedValue({ ok: false, partial, error: '删除失败', ids: partial ? ['db-1'] : [], urls: [] });
    const { actions, params } = Harness();
    expect(await actions.handleBatchDeleteProjects([project])).toBe(false);
    expect(params.deleteSession).not.toHaveBeenCalled();
    expect(params.showToast).toHaveBeenCalledWith(expect.stringContaining('删除未全部完成'));
    expect(params.refetchAssetTasks).toHaveBeenCalledOnce();
  });

  it('keeps the project after a network exception and allows a retry', async () => {
    vi.mocked(permanentDeleteGeneration).mockRejectedValueOnce(new Error('网络断开'));
    const { actions, params } = Harness();
    expect(await actions.handleBatchDeleteProjects([project])).toBe(false);
    expect(params.deleteSession).not.toHaveBeenCalled();
    expect(await actions.handleBatchDeleteProjects([project])).toBe(true);
    expect(params.deleteSession).toHaveBeenCalledOnce();
  });

  it('waits for acknowledged deletion, protects canvas URLs and does not match another session by substring', async () => {
    const own = { id: 'own', sessionId: project.id };
    const other = { id: 'other', sessionId: 'session-10', batchId: 'session-10' };
    const { actions, params } = Harness({ mergedTasks: [own, other] });
    vi.mocked(permanentDeleteGeneration).mockImplementation(async () => {
      expect(params.deleteSession).not.toHaveBeenCalled();
      return { ok: true, ids: ['own'], urls: [], warning: '共享文件已保留' };
    });
    expect(await actions.handleBatchDeleteProjects([project])).toBe(true);
    expect(permanentDeleteGeneration).toHaveBeenCalledWith([own], { protectUrls: ['/image.png'] });
    expect(params.deleteSession).toHaveBeenCalledWith(project.id);
    expect(params.showToast).toHaveBeenCalledWith(expect.stringContaining('共享文件已保留'));
  });

  it('blocks session deletion while history is incomplete', async () => {
    const { actions, params } = Harness({ serverHistoryComplete: false });
    expect(await actions.handleBatchDeleteProjects([project])).toBe(false);
    expect(confirmAction).not.toHaveBeenCalled();
    expect(params.deleteSession).not.toHaveBeenCalled();
  });

  it('leaves all data unchanged when confirmation is cancelled', async () => {
    vi.mocked(confirmAction).mockResolvedValue(false);
    const { actions, params } = Harness();
    expect(await actions.handleBatchDeleteProjects([project])).toBe(false);
    expect(permanentDeleteGeneration).not.toHaveBeenCalled();
    expect(params.deleteSession).not.toHaveBeenCalled();
  });

  it('uses the same lock for project deletion, media deletion and downloads', async () => {
    let confirm!: (value: boolean) => void;
    vi.mocked(confirmAction).mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; }));
    const { actions } = Harness();
    const pending = actions.handleBatchDeleteProjects([project]);
    expect(await actions.handleBatchDeleteProjects([project])).toBe(false);
    expect(await actions.handleBatchDeleteTasks(['db-1'])).toBe(false);
    await actions.handleBatchDownloadTasks(['db-1']);
    expect(exportZipDownload).not.toHaveBeenCalled();
    expect(confirmAction).toHaveBeenCalledOnce();
    confirm(true);
    expect(await pending).toBe(true);
  });

  it('removes completed projects but preserves the failed and unprocessed projects in a batch', async () => {
    vi.mocked(permanentDeleteGeneration).mockResolvedValueOnce({ ok: false, error: '失败', ids: [], urls: [] });
    const { actions, params } = Harness();
    const canvasProject = { ...project, id: 'c', type: 'canvas' as const };
    expect(await actions.handleBatchDeleteProjects([canvasProject, project, { ...project, id: 'later' }])).toBe(false);
    expect(params.onDeleteCanvasProject).toHaveBeenCalledWith('c');
    expect(params.deleteSession).not.toHaveBeenCalled();
  });

  it('unlocks even if refreshing after a successful delete fails', async () => {
    const { actions, params } = Harness();
    vi.mocked(params.refetchAssetTasks).mockRejectedValue(new Error('刷新失败'));
    expect(await actions.handleBatchDeleteProjects([project])).toBe(true);
    expect(await actions.handleBatchDeleteProjects([{ ...project, type: 'canvas', id: 'c' }])).toBe(true);
  });
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

  it('deletes a real canvas node called cover without deleting the entire project', async () => {
    const { actions, params } = Harness({ mergedTasks: [{ id: 'canvas-cover', canvasProjectId: 'c', nodeId: 'cover' }] });
    expect(await actions.handleBatchDeleteTasks(['canvas-cover'])).toBe(true);
    expect(params.onDeleteCanvasNode).toHaveBeenCalledWith('c', 'cover');
    expect(params.onDeleteCanvasProject).not.toHaveBeenCalled();
    expect(permanentDeleteGeneration).not.toHaveBeenCalled();
  });
});
