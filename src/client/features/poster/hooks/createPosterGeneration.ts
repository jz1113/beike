import { posterQueue, type PosterRunMode } from '../model/posterWorkflow';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { directCoverDesign, generateFinalCover, rewriteCoverTitle } from '../api/posterApi';
import { buildDesignPlan, previousDesignSummary, normalizeCoverTitle, makeId, preservedOriginalTitle, posterInputError, shouldRewriteCoverTitle } from '../model/posterTypes';
import type { PosterItem } from '../model/posterTypes';
import type { PosterState } from './usePosterState';
import type { createPosterHistory } from './createPosterHistory';

export function createPosterGeneration(context: Pick<PosterState,
    'currentSettings' | 'aliveRef' | 'restoringRef' | 'exportingRef' | 'importingRef'
    | 'ensureWorkspaceReady' | 'activeItemsRef' | 'runningRef' | 'itemsRef' | 'productionModelError'
    | 'setNoticeIfAlive' | 'abortRef' | 'setIsRunningIfAlive' | 'activeAttemptsRef'
    | 'availableTitleModelsRef' | 'itemAbortControllers' | 'metadataBarrierRef' | 'activeBatchIdRef'
  > & Pick<ReturnType<typeof createPosterHistory>, 'ensureActiveBatch' | 'persistActiveBatch' | 'activeBatchIsCurrent' | 'withOwnedBatchLock'> & { updateItem: (id: string, patch: Partial<PosterItem>) => void; signalForItem: (id: string) => AbortSignal; isAborted: () => boolean }) {
  const {
    currentSettings, aliveRef, restoringRef, exportingRef, importingRef, ensureWorkspaceReady,
    activeItemsRef, runningRef, isAborted, itemsRef, productionModelError, updateItem,
    setNoticeIfAlive, abortRef, setIsRunningIfAlive, signalForItem, activeAttemptsRef,
    availableTitleModelsRef, ensureActiveBatch, persistActiveBatch, itemAbortControllers,
    metadataBarrierRef, activeBatchIdRef, activeBatchIsCurrent, withOwnedBatchLock,
  } = context;
  const runItemInternal = async (requestedItem: PosterItem, index: number, fromBatch = false, settings = currentSettings(), mode: PosterRunMode = 'all') => {
    if (!aliveRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    if (activeItemsRef.current.has(requestedItem.id) || !fromBatch && runningRef.current) return;
    if (fromBatch && isAborted()) return;
    const item = itemsRef.current.find((candidate) => candidate.id === requestedItem.id);
    if (!item) return;
    if (item.status === 'complete' && item.resultUrl) return;
    const recoveringImage = Boolean(item.imageTaskId || item.generatedSceneUrl || item.generationRecoveryRequired);
    if (mode !== 'all' && !posterQueue([item], mode).length) return;
    const inputError = !recoveringImage && (item.importError || posterInputError(item) || productionModelError(settings, mode));
    if (inputError) {
      updateItem(item.id, { status: 'failed', error: inputError });
      setNoticeIfAlive(inputError);
      return;
    }
    if (!fromBatch) {
      abortRef.current.aborted = false;
      setIsRunningIfAlive(true);
    }
    const signal = signalForItem(item.id);
    const itemAborted = () => !aliveRef.current || isAborted() || signal.aborted;
    let imageRequestStarted = false;
    activeItemsRef.current.add(item.id);
    const attempt = { recovering: recoveringImage, dispatched: false };
    activeAttemptsRef.current.set(item.id, attempt);
    try {
      const reuseDesign = !recoveringImage && Boolean(item.designPlan && item.prompt && item.coverTitle);
      const shouldRewriteTitle = !recoveringImage && !reuseDesign && shouldRewriteCoverTitle(item, settings.titleHandling);
      updateItem(item.id, { status: shouldRewriteTitle ? 'rewriting' : 'prompting', error: undefined, modelFallbackNote: undefined, resultUrl: undefined });

      const modelLabel = (modelId: string) => {
        const model = availableTitleModelsRef.current.find((candidate) => candidate.id === modelId);
        return model?.shortName || model?.name || modelId;
      };
      const runWithModelFallback = async <T,>(
        stage: '标题改写' | '封面设计',
        status: 'rewriting' | 'prompting',
        preferredModel: string,
        request: (modelId: string) => Promise<T>,
      ): Promise<{ value: T; modelId: string; fallbackNote?: string }> => {
        try {
          return { value: await request(preferredModel), modelId: preferredModel };
        } catch (error) {
          if (itemAborted()) throw error;
          updateItem(item.id, { status });
          const reason = error instanceof Error ? error.message : '未知错误';
          throw new Error(`${stage}模型 ${modelLabel(preferredModel)} 请求结果不确定，已停止自动切换：${reason}`);
        }
      };

      const titleResult = shouldRewriteTitle
        ? await runWithModelFallback('标题改写', 'rewriting', settings.titleModel, (modelId) => rewriteCoverTitle(item, modelId, signal))
        : {
          value: recoveringImage || reuseDesign ? item.coverTitle : item.isTitleEdited ? normalizeCoverTitle(item.coverTitle) : preservedOriginalTitle(item),
          modelId: settings.titleModel,
        };
      const coverTitle = titleResult.value;
      if (itemAborted()) throw new Error('已取消大字报任务');
      if (!recoveringImage && (shouldRewriteTitle || item.isTitleEdited) && (coverTitle.length < 4 || coverTitle.length > 18)) {
        throw new Error('封面标题请保持 4–18 字；不会自动截断词语');
      }
      updateItem(item.id, { status: 'prompting', coverTitle, modelFallbackNote: titleResult.fallbackNote });

      let designPlan = item.designPlan;
      let prompt = item.prompt;
      if (!recoveringImage && !reuseDesign) {
        const previous = [...itemsRef.current.slice(0, index)].reverse().find((row) => row.designPlan);
        const batchId = ensureActiveBatch();
        const directorResult = await runWithModelFallback(
          '封面设计', 'prompting', titleResult.modelId,
          (modelId) => directCoverDesign(item, coverTitle, modelId, {
            batchId,
            supplementaryRequirements: settings.supplementaryRequirements,
            previousDesign: previousDesignSummary(previous?.designPlan),
            memorySampleId: item.memorySampleId || settings.memorySampleId || 'auto',
            memoryUsageId: item.memoryUsageId,
            signal,
          }),
        );
        if (itemAborted()) throw new Error('已取消大字报任务');
        designPlan = buildDesignPlan(coverTitle, directorResult.value.design);
        prompt = designPlan.generationDirection;
        updateItem(item.id, {
          status: 'prompting', coverTitle, prompt, designPlan, promptVersion: 'reference-cover-v6',
          memorySampleId: directorResult.value.memorySampleId,
          memoryEntryIds: directorResult.value.memoryEntryIds,
          memoryUsageId: directorResult.value.memoryUsageId,
          memoryRevisionId: directorResult.value.memoryRevisionId,
          memoryWarning: directorResult.value.memoryWarning,
          modelFallbackNote: directorResult.fallbackNote || titleResult.fallbackNote,
        });
      }
      if (mode === 'design') {
        updateItem(item.id, { status: 'idle', error: undefined });
        if (!await persistActiveBatch()) throw new Error('方案已完成但保存失败，请保留页面并释放存储后再试。');
        return;
      }
      const submissionKey = item.imageSubmissionKey || (!recoveringImage ? `headline:${ensureActiveBatch()}:${item.id}:${makeId()}` : undefined);
      updateItem(item.id, { status: 'rendering', imageSubmissionKey: submissionKey, generationRecoveryRequired: true });
      // Save the operation key before any billable submission is dispatched.
      if (!await persistActiveBatch() && !recoveringImage) throw new Error('无法保存原任务查询标识，已停止本次生图；请释放浏览器存储后重试。');
      if (itemAborted()) throw new Error('已取消大字报任务');
      imageRequestStarted = true;
      attempt.dispatched = true;
      const resultUrl = await generateFinalCover(
        item.sourceImageUrl, item.originalTitle, coverTitle, item.productName, item.format,
        designPlan, prompt, settings.imageModel, settings.imageQuality, itemAborted,
        {
          taskId: item.imageTaskId, submissionKey, sceneUrl: item.generatedSceneUrl,
          required: item.generationRecoveryRequired, signal,
          onTaskSubmitted: (imageTaskId) => updateItem(item.id, { imageTaskId }),
          onSceneGenerated: (generatedSceneUrl) => updateItem(item.id, { generatedSceneUrl }),
        },
      );
      if (itemAborted()) {
        if (resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
        throw new Error('已取消大字报任务');
      }
      updateItem(item.id, { status: 'complete', resultUrl, generationRecoveryRequired: false });
    } catch (error) {
      if (itemAborted()) {
        // AbortError may be reported as “signal is aborted without reason” by
        // the browser/runtime. It is an interruption, never a generation
        // failure, and must not overwrite the recoverable batch snapshot.
        updateItem(item.id, {
          status: 'interrupted',
          ...(!imageRequestStarted && !recoveringImage ? { imageSubmissionKey: undefined, generationRecoveryRequired: false } : {}),
          error: imageRequestStarted || recoveringImage ? '已停止等待，继续时会核对原生图任务。' : undefined,
          modelFallbackNote: undefined,
        });
        return;
      }
      const current = itemsRef.current.find((row) => row.id === item.id);
      const definiteFailure = error instanceof Error && (error.name === 'ImageGenBusinessError'
        || 'retryable' in error && error.retryable === false && !requiresGenerationRecovery(error));
      const recoveryRequired = !definiteFailure && (requiresGenerationRecovery(error)
        || Boolean(current?.imageTaskId || current?.generatedSceneUrl)
        || Boolean(current?.generationRecoveryRequired && (imageRequestStarted || recoveringImage)));
      updateItem(item.id, {
        status: 'failed', generationRecoveryRequired: recoveryRequired,
        ...(definiteFailure || !recoveryRequired ? { imageTaskId: undefined, imageSubmissionKey: undefined, generatedSceneUrl: undefined } : {}),
        error: error instanceof Error ? error.message : '生成任务异常，请稍后重试',
      });
    } finally {
      if (aliveRef.current) await persistActiveBatch();
      activeItemsRef.current.delete(item.id);
      activeAttemptsRef.current.delete(item.id);
      itemAbortControllers.current.delete(item.id);
      if (!fromBatch) setIsRunningIfAlive(false);
    }
  };

  const withBatchGenerationLock = async (operation: () => Promise<void>, hasNewGeneration: boolean) => {
    // Imports may still be finishing their durable snapshot when the next UI
    // action begins. Wait for our own save before requesting the generation lock.
    await metadataBarrierRef.current;
    if (!ensureWorkspaceReady() || !activeBatchIdRef.current || !activeBatchIsCurrent()) return;
    if (!globalThis.navigator?.locks) {
      if (hasNewGeneration) {
        setNoticeIfAlive('浏览器不支持跨页面任务保护，请使用新版浏览器生成；已有原生图仍可恢复和下载。');
        return;
      }
      await operation();
      return;
    }
    await withOwnedBatchLock(activeBatchIdRef.current, async () => {
      if (ensureWorkspaceReady() && activeBatchIsCurrent()) await operation();
    }, () => { setNoticeIfAlive('另一个页面正在处理此批次，请等待它结束后再打开历史批次。'); })
      .catch((error) => setNoticeIfAlive(`任务保护锁不可用，已停止本次操作：${error instanceof Error ? error.message : '请刷新页面重试。'}`));
  };

  const runItem = async (item: PosterItem, index: number) => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current) return;
    await withBatchGenerationLock(() => runItemInternal(item, index), !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired);
  };

  const runBatchInternal = async (onlyFailed = false, mode: PosterRunMode = 'all') => {
    if (!aliveRef.current || runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const settings = currentSettings();
    const queue = posterQueue(itemsRef.current, mode, onlyFailed);
    if (queue.length === 0) {
      setNoticeIfAlive(onlyFailed ? '没有可重试的失败记录。' : '没有待生成任务；请先导入图片链接、原标题和文字竖/文字横。');
      return;
    }
    const modelError = productionModelError(settings, mode);
    if (modelError && queue.every((item) => !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired)) {
      setNoticeIfAlive(modelError);
      return;
    }
    abortRef.current.aborted = false;
    setIsRunningIfAlive(true);
    const indices = new Map(itemsRef.current.map((item, index) => [item.id, index]));
    const pending = queue.map((item) => ({ item, index: indices.get(item.id)! }));
    let cursor = 0;
    setNoticeIfAlive(mode === 'design' ? `正在为 ${queue.length} 条素材准备标题和方案，完成后可预览，不会提交生图。` : `正在处理 ${queue.length} 条封面；已提交的任务会先核对原结果。`);
    try {
      await Promise.all(Array.from({ length: Math.min(settings.concurrency, pending.length) }, async () => {
        while (cursor < pending.length && !isAborted()) {
          const next = pending[cursor++];
          if (next) await runItemInternal(next.item, next.index, true, settings, mode);
        }
      }));
      setNoticeIfAlive(isAborted() ? '已停止等待；继续生成会先核对已提交的原生图任务。' : mode === 'design' ? '方案准备结束，请逐条查看标题与提示词，再确认生成封面。' : '本轮任务已结束。可筛选失败项处理，或下载成功成品。');
    } finally {
      setIsRunningIfAlive(false);
    }
  };

  const runBatch = async (onlyFailed = false, mode: PosterRunMode = 'all') => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current) return;
    const hasNewGeneration = posterQueue(itemsRef.current, mode, onlyFailed).some((item) => !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired);
    await withBatchGenerationLock(() => runBatchInternal(onlyFailed, mode), hasNewGeneration);
  };


  return { runItem, runBatch };
}
