import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPosterGeneration } from './createPosterGeneration';
import { COVER_FORMATS } from '../model/coverFormat';
import type { PosterItem, PosterProductionSettings } from '../model/posterTypes';
import { directCoverDesign, generateFinalCover, rewriteCoverTitle } from '../api/posterApi';

vi.mock('../api/posterApi', () => ({
  directCoverDesign: vi.fn(), generateFinalCover: vi.fn(), rewriteCoverTitle: vi.fn(),
}));

type Context = Parameters<typeof createPosterGeneration>[0];
const ref = <T,>(current: T) => ({ current });

function fixture(recovering = true) {
  const item: PosterItem = {
    id: 'cover-1', sourceImageUrl: 'https://example.com/product.jpg', originalTitle: '原始商品名称',
    productName: '商品', coverTitle: '清晰呈现商品好细节', format: COVER_FORMATS.portrait,
    status: 'idle', ...(recovering ? { imageTaskId: 'original-task', generationRecoveryRequired: true } : {}),
  };
  const settings: PosterProductionSettings = {
    imageModel: 'gpt-image-2', titleModel: 'vision-model', titleHandling: 'original',
    imageQuality: 'high', concurrency: 2, memorySampleId: '',
  };
  const context: Context = {
    currentSettings: () => settings, aliveRef: ref(true), restoringRef: ref(false),
    exportingRef: ref(false), importingRef: ref(false), ensureWorkspaceReady: () => true,
    activeItemsRef: ref(new Set<string>()), runningRef: ref(false), itemsRef: ref([item]),
    productionModelError: () => undefined, setNoticeIfAlive: vi.fn(), abortRef: ref({ aborted: false }),
    setIsRunningIfAlive: value => { context.runningRef.current = value; },
    activeAttemptsRef: ref(new Map()), availableTitleModelsRef: ref([{ id: settings.titleModel }]),
    itemAbortControllers: ref(new Map()), metadataBarrierRef: ref(null), activeBatchIdRef: ref('batch-1'),
    ensureActiveBatch: () => 'batch-1', persistActiveBatch: vi.fn(async () => true),
    activeBatchIsCurrent: () => true,
    withOwnedBatchLock: async (_id, operation) => operation(),
    updateItem: (id, patch) => {
      context.itemsRef.current = context.itemsRef.current.map(row => row.id === id ? { ...row, ...patch } : row);
    },
    signalForItem: () => new AbortController().signal,
    isAborted: () => context.abortRef.current.aborted,
  };
  return { context, item, runner: createPosterGeneration(context) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { locks: { request: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('poster production after workflow extraction', () => {
  it('recovers the original task without rerunning title or design requests', async () => {
    const { context, item, runner } = fixture();
    vi.mocked(generateFinalCover).mockResolvedValue('https://example.com/result.jpg');
    await runner.runItem(item, 0);
    expect(rewriteCoverTitle).not.toHaveBeenCalled();
    expect(directCoverDesign).not.toHaveBeenCalled();
    expect(generateFinalCover).toHaveBeenCalledOnce();
    expect(vi.mocked(generateFinalCover).mock.calls[0][10]).toMatchObject({ taskId: 'original-task', required: true });
    expect(context.itemsRef.current[0]).toMatchObject({ status: 'complete', generationRecoveryRequired: false });
    expect(context.activeItemsRef.current.size).toBe(0);
  });

  it('retains task recovery data when waiting is interrupted', async () => {
    const { context, item, runner } = fixture();
    vi.mocked(generateFinalCover).mockImplementation(async () => {
      context.abortRef.current.aborted = true;
      throw new DOMException('Stopped', 'AbortError');
    });
    await runner.runItem(item, 0);
    expect(context.itemsRef.current[0]).toMatchObject({
      status: 'interrupted', imageTaskId: 'original-task', generationRecoveryRequired: true,
    });
    expect(context.runningRef.current).toBe(false);
    expect(context.activeAttemptsRef.current.size).toBe(0);
  });

  it('does not dispatch a paid image request when its submission key could not be saved', async () => {
    const { context, item, runner } = fixture(false);
    vi.mocked(directCoverDesign).mockResolvedValue({ memorySampleId: '', memoryEntryIds: [], design: {
      title: item.originalTitle, titleLines: [item.originalTitle], imagePrompt: '商品真实清晰',
    } });
    vi.mocked(context.persistActiveBatch).mockResolvedValue(false);
    await runner.runItem(item, 0);
    expect(generateFinalCover).not.toHaveBeenCalled();
    expect(context.itemsRef.current[0].status).toBe('failed');
    expect(context.itemsRef.current[0].error).toContain('无法保存原任务查询标识');
  });
  it('keeps a saved rule snapshot on design retry and reuses a completed design after image failure', async () => {
    const { context, item, runner } = fixture(false);
    item.memoryUsageId = 'original-usage';
    item.memorySampleId = 'original-sample';
    vi.mocked(directCoverDesign).mockResolvedValue({ memorySampleId: 'original-sample', memoryEntryIds: ['old-rule'], memoryUsageId: 'new-usage', memoryRevisionId: 'original-revision', design: {
      title: item.originalTitle, titleLines: [item.originalTitle], layout: '保持主体', imagePrompt: '原方案',
    } });
    vi.mocked(generateFinalCover).mockRejectedValueOnce(Object.assign(new Error('确定失败'), { retryable: false }));
    await runner.runItem(item, 0);
    expect(directCoverDesign).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ memoryUsageId: 'original-usage' }));
    expect(context.itemsRef.current[0]).toMatchObject({ memoryUsageId: 'new-usage', memoryRevisionId: 'original-revision', status: 'failed' });
    vi.mocked(generateFinalCover).mockResolvedValueOnce('https://example.com/result.jpg');
    await runner.runItem(context.itemsRef.current[0], 0);
    expect(directCoverDesign).toHaveBeenCalledOnce();
    expect(context.itemsRef.current[0].status).toBe('complete');
  });

});


describe('prepare and render phases', () => {
  it('persists a preview without submitting an image, then renders without another design call', async () => {
    const { context, item, runner } = fixture(false);
    vi.mocked(directCoverDesign).mockResolvedValue({ memorySampleId: 'sample', memoryEntryIds: [], design: {
      title: item.originalTitle, titleLines: [item.originalTitle], imagePrompt: '已审阅的完整方案',
    } });
    await runner.runBatch(false, 'design');
    expect(generateFinalCover).not.toHaveBeenCalled();
    expect(context.itemsRef.current[0]).toMatchObject({ status: 'idle', prompt: '已审阅的完整方案' });
    expect(context.persistActiveBatch).toHaveBeenCalled();
    vi.mocked(generateFinalCover).mockResolvedValue('https://example.com/result.jpg');
    await runner.runBatch(false, 'render');
    expect(directCoverDesign).toHaveBeenCalledOnce();
    expect(generateFinalCover).toHaveBeenCalledOnce();
    expect(context.itemsRef.current[0].status).toBe('complete');
  });
  it('never designs an unprepared item when asked to render', async () => {
    const { runner } = fixture(false);
    await runner.runBatch(false, 'render');
    expect(directCoverDesign).not.toHaveBeenCalled();
    expect(generateFinalCover).not.toHaveBeenCalled();
  });
  it('does not reconcile an image during the design-only phase', async () => {
    const { runner } = fixture(true);
    await runner.runBatch(false, 'design');
    expect(generateFinalCover).not.toHaveBeenCalled();
    expect(directCoverDesign).not.toHaveBeenCalled();
  });
});
