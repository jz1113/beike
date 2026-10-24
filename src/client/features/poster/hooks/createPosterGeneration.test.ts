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
});
