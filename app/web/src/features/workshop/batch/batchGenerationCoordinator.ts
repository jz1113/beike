
import type { BatchProductItem, GenerationStrategy } from './batchTypes';
import { ensureItemPromptsPad } from './batchPromptPadding';
import { runSingleShotGeneration } from './batchShotRunner';
import { runBatchGenerationWorkers, runRetryFailedGenerationWorkers } from './batchImageGeneration';
import {
  executeSingleImageTask,
  generateItemViaGrid,
  type TaskExecutionConfig,
} from './batchTaskExecution';

export interface BatchCoordinatorDeps {
  config: TaskExecutionConfig;
  generationStrategy: GenerationStrategy;
  imageGenConcurrency: number;
  itemsRef: React.MutableRefObject<BatchProductItem[]>;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isAbortedRef: React.MutableRefObject<boolean>;
  showToast: (msg: string) => void;
  setCurrentStage: (stage: number) => void;
  setIsGeneratingBatch: (val: boolean) => void;
  setTotalTaskCount: (val: number) => void;
  setCompletedTaskCount: (val: number) => void;
  setSuccessTaskCount: (val: number) => void;
  setFailTaskCount: (val: number) => void;
  generateAllCopywriting: () => Promise<void>;
}

export async function startBatchGenerationCoordinator(deps: BatchCoordinatorDeps): Promise<void> {
  const {
    config,
    generationStrategy,
    imageGenConcurrency,
    itemsRef,
    setItems,
    isAbortedRef,
    showToast,
    setCurrentStage,
    setIsGeneratingBatch,
    setTotalTaskCount,
    setCompletedTaskCount,
    setSuccessTaskCount,
    setFailTaskCount,
    generateAllCopywriting,
  } = deps;

  const latestSuccessful = itemsRef.current.filter((i) => i.status === 'success' && i.selected);
  if (latestSuccessful.length === 0) {
    showToast('没有待生成的商品');
    return;
  }

  const notReady = latestSuccessful.filter(
    (p) => !p.analyzedSuccess || !p.prompts || p.prompts.length === 0
  );
  if (notReady.length > 0) {
    showToast(`🚨 生产安全阻断：有 ${notReady.length} 款商品尚未完成「AI 提示词分析」，严禁启动生图队列！请先在步骤3完成分析`);
    return;
  }

  const defaultQuadrantTitles = [
    '左上·自然生活肖像',
    '右上·侧颜微风光影',
    '左下·局部超清微距',
    '右下·松弛生活瞬间',
  ];

  setItems((prev) =>
    prev.map((p) => {
      if (!p.selected && p.status !== 'success') return p;
      const paddedPrompts = ensureItemPromptsPad(p, {
        batchMode: config.batchMode,
        hasHumanPersona: config.hasHumanPersona,
        lockedSceneId: config.lockedSceneId,
        availableScenes: config.availableScenes || [],
        selectedShotCount: config.selectedShotCount,
      });
      const effectivePrompts = (paddedPrompts.length > 0 ? paddedPrompts : p.prompts).filter(
        (shot) => shot.selected !== false
      );

      const itemTasks = Array.from({ length: 4 }).map((_, idx) => {
        const shotNo = idx + 1;
        const shot = effectivePrompts[idx] || effectivePrompts[0];
        const title = shot?.title || defaultQuadrantTitles[idx];
        const prompt = shot?.prompt || '';
        return {
          id: `gen_${p.id}_${shotNo}_${idx}`,
          shot_no: shotNo,
          title,
          prompt,
          status: 'PENDING' as const,
        };
      });
      return { ...p, tasks: itemTasks };
    })
  );

  setCurrentStage(config.batchMode === 'original' ? 4 : 5);
  setIsGeneratingBatch(true);
  isAbortedRef.current = false;

  const totalSlices = latestSuccessful.length * 4;
  setTotalTaskCount(totalSlices);
  setCompletedTaskCount(0);
  setSuccessTaskCount(0);
  setFailTaskCount(0);

  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  const bumpProgress = (ok: boolean, n = 1) => {
    completed += n;
    if (ok) successCount += n;
    else failCount += n;
    setCompletedTaskCount(Math.min(completed, totalSlices));
    setSuccessTaskCount(successCount);
    setFailTaskCount(failCount);
  };

  const concurrency = Math.min(imageGenConcurrency || 4, latestSuccessful.length);

  await runBatchGenerationWorkers({
    items: latestSuccessful,
    concurrency,
    isAborted: () => isAbortedRef.current,
    generateItem: async (currentItem) => {
      const currentItemId = currentItem.id;
      const paddedPrompts = ensureItemPromptsPad(currentItem, {
        batchMode: config.batchMode,
        hasHumanPersona: config.hasHumanPersona,
        lockedSceneId: config.lockedSceneId,
        availableScenes: config.availableScenes || [],
        selectedShotCount: config.selectedShotCount,
      });
      const effectivePrompts = paddedPrompts.length > 0 ? paddedPrompts : currentItem.prompts;
      if (generationStrategy === 'grid_first') {
        await generateItemViaGrid(currentItem, currentItemId, config, setItems, bumpProgress);
      } else {
        await runSingleShotGeneration(currentItem, currentItemId, effectivePrompts, {
          hasHumanPersona: config.hasHumanPersona,
          isAborted: () => isAbortedRef.current,
          executeSingleImageTask: (item, shot, anchorFace) =>
            executeSingleImageTask(item, shot, anchorFace, config),
          updateItemTasks: (itemId, updater) => {
            setItems((prev) =>
              prev.map((p) => (p.id === itemId ? { ...p, tasks: updater(p.tasks) } : p))
            );
          },
          bumpProgress,
        });
      }
    },
  });

  setIsGeneratingBatch(false);
  void generateAllCopywriting();

  if (failCount === 0) {
    showToast(`批量生图全部完成！成功 ${successCount} 张 / ${latestSuccessful.length} 款商品`);
  } else if (successCount === 0) {
    showToast(`批量生图全部失败（${failCount} 张）。请查看失败原因后重试`);
  } else {
    showToast(`批量生图结束：成功 ${successCount} 张，失败 ${failCount} 张`);
  }
}

export async function retryFailedImageTasksCoordinator(
  deps: BatchCoordinatorDeps,
  successfulItems: BatchProductItem[],
  isGeneratingBatch: boolean
): Promise<void> {
  if (isGeneratingBatch) return;

  const {
    config,
    imageGenConcurrency,
    setItems,
    isAbortedRef,
    showToast,
    setIsGeneratingBatch,
    setTotalTaskCount,
    setCompletedTaskCount,
    setSuccessTaskCount,
    setFailTaskCount,
  } = deps;

  const failedItems = successfulItems.filter((item) =>
    (item.tasks || []).some((t) => t.status === 'FAILURE')
  );

  if (failedItems.length === 0) {
    showToast('没有失败的分镜需要重试');
    return;
  }

  const failedTaskCount = failedItems.reduce(
    (n, item) => n + (item.tasks || []).filter((t) => t.status === 'FAILURE').length,
    0
  );

  setIsGeneratingBatch(true);
  isAbortedRef.current = false;
  setTotalTaskCount(failedTaskCount);
  setCompletedTaskCount(0);
  setSuccessTaskCount(0);
  setFailTaskCount(0);

  let completed = 0;
  let successCount = 0;
  let failCount = 0;
  const bumpProgress = (ok: boolean, n = 1) => {
    completed += n;
    if (ok) successCount += n;
    else failCount += n;
    setCompletedTaskCount(Math.min(completed, failedTaskCount));
    setSuccessTaskCount(successCount);
    setFailTaskCount(failCount);
  };

  setItems((prev) =>
    prev.map((p) => {
      if (!failedItems.some((f) => f.id === p.id)) return p;
      return {
        ...p,
        tasks: (p.tasks || []).map((t) =>
          t.status === 'FAILURE'
            ? {
                ...t,
                status: 'IN_PROGRESS' as const,
                error: undefined,
              }
            : t
        ),
      };
    })
  );

  const concurrency = Math.min(imageGenConcurrency || 4, failedItems.length);

  await runRetryFailedGenerationWorkers({
    items: failedItems,
    concurrency,
    isAborted: () => isAbortedRef.current,
    retryItem: async (currentItem) => {
      const currentItemId = currentItem.id;
      const paddedPrompts = ensureItemPromptsPad(currentItem, {
        batchMode: config.batchMode,
        hasHumanPersona: config.hasHumanPersona,
        lockedSceneId: config.lockedSceneId,
        availableScenes: config.availableScenes || [],
        selectedShotCount: config.selectedShotCount,
      });
      const effectivePrompts = paddedPrompts.length > 0 ? paddedPrompts : currentItem.prompts;
      const failedIndices = currentItem.tasks
        .map((t, idx) => (t.status === 'FAILURE' || t.status === 'IN_PROGRESS' ? idx : -1))
        .filter((idx) => idx >= 0);
      await runSingleShotGeneration(
        currentItem,
        currentItemId,
        effectivePrompts,
        {
          hasHumanPersona: config.hasHumanPersona,
          isAborted: () => isAbortedRef.current,
          executeSingleImageTask: (item, shot, anchorFace) =>
            executeSingleImageTask(item, shot, anchorFace, config),
          updateItemTasks: (itemId, updater) => {
            setItems((prev) =>
              prev.map((p) => (p.id === itemId ? { ...p, tasks: updater(p.tasks) } : p))
            );
          },
          bumpProgress,
        },
        { onlyFailedIndices: failedIndices }
      );
    },
  });

  setIsGeneratingBatch(false);

  if (failCount === 0) {
    showToast(`失败分镜重试完成：全部成功 ${successCount} 张`);
  } else if (successCount === 0) {
    showToast(`失败分镜重试仍全部失败（${failCount} 张）`);
  } else {
    showToast(`失败分镜重试结束：成功 ${successCount} 张，仍失败 ${failCount} 张`);
  }
}

export async function retrySingleShotTaskCoordinator(
  itemId: string,
  shotIndex: number,
  items: BatchProductItem[],
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  config: TaskExecutionConfig,
  showToast: (msg: string) => void
): Promise<void> {
  const targetItem = items.find((i) => i.id === itemId);
  if (!targetItem) return;

  setItems((prev) =>
    prev.map((p) => {
      if (p.id !== itemId) return p;
      const updatedTasks = [...p.tasks];
      if (updatedTasks[shotIndex]) {
        updatedTasks[shotIndex] = { ...updatedTasks[shotIndex], status: 'IN_PROGRESS', error: undefined };
      }
      return { ...p, tasks: updatedTasks };
    })
  );

  try {
    const paddedPrompts = ensureItemPromptsPad(targetItem, {
      batchMode: config.batchMode,
      hasHumanPersona: config.hasHumanPersona,
      lockedSceneId: config.lockedSceneId,
      availableScenes: config.availableScenes || [],
      selectedShotCount: config.selectedShotCount,
    });
    const effectivePrompts = paddedPrompts.length > 0 ? paddedPrompts : targetItem.prompts;
    const shot = effectivePrompts[shotIndex];
    if (!shot) throw new Error('未找到分镜提示词');

    const shot1Url =
      shotIndex > 0 && targetItem.tasks[0]?.status === 'SUCCESS'
        ? targetItem.tasks[0]?.resultUrl
        : undefined;
    const anchorFace = config.hasHumanPersona && shot1Url ? shot1Url : undefined;

    const shotUrl = await executeSingleImageTask(targetItem, shot, anchorFace, config);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== itemId) return p;
        const updatedTasks = [...p.tasks];
        if (updatedTasks[shotIndex]) {
          updatedTasks[shotIndex] = {
            ...updatedTasks[shotIndex],
            status: 'SUCCESS',
            resultUrl: shotUrl,
            error: undefined,
          };
        }
        return { ...p, tasks: updatedTasks };
      })
    );
    showToast(`分镜 ${shotIndex + 1} 重新生成成功！`);
  } catch (err: any) {
    console.error('[retrySingleShotTask] 单镜重试失败:', err);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== itemId) return p;
        const updatedTasks = [...p.tasks];
        if (updatedTasks[shotIndex]) {
          updatedTasks[shotIndex] = {
            ...updatedTasks[shotIndex],
            status: 'FAILURE',
            error: err.message || '重试失败',
          };
        }
        return { ...p, tasks: updatedTasks };
      })
    );
    showToast(`分镜 ${shotIndex + 1} 重试失败: ${err.message || ''}`);
  }
}
