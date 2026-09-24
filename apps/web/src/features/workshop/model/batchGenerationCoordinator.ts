import type { ShotPrompt } from '@beike/domain/vision';
import type { BatchProductItem, BatchTaskItem, GenerationStrategy } from './batchTypes';
import { runBatchGenerationWorkers, runRetryFailedGenerationWorkers } from './batchImageGeneration';
import {
  executeSingleImageTask,
  type TaskExecutionConfig,
} from './batchTaskExecution';
import { mergeGenerationTasks, needsGenerationSubmit } from './mergeGenerationTasks';
import type { RunControl } from './runControl';

export interface BatchCoordinatorDeps {
  config: TaskExecutionConfig;
  generationStrategy: GenerationStrategy;
  imageGenConcurrency: number;
  itemsRef: React.MutableRefObject<BatchProductItem[]>;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  runControlRef: React.MutableRefObject<RunControl>;
  batchId: string;
  storyboardRevision: number;
  showToast: (msg: string) => void;
  setCurrentStage: (stage: number) => void;
  setIsGeneratingBatch: (val: boolean) => void;
  setTotalTaskCount: (val: number) => void;
  setCompletedTaskCount: (val: number) => void;
  setSuccessTaskCount: (val: number) => void;
  setFailTaskCount: (val: number) => void;
  autoGenerateCopywriting: boolean;
  generateAllCopywriting: () => Promise<void>;
}

let generationLock = false;

function selectedShots(item: BatchProductItem): ShotPrompt[] {
  return (item.prompts || []).filter((shot) => shot.selected !== false);
}

function hasRecoveryRequired(items: BatchProductItem[]): boolean {
  return items.some((item) => (item.tasks || []).some((task) => task.recoveryRequired));
}

function findShotByNo(item: BatchProductItem, shotNo: number | undefined): ShotPrompt | undefined {
  if (!shotNo) return undefined;
  return (item.prompts || []).find((shot) => shot.shot_no === shotNo);
}

function patchItemTasks(
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  itemId: string,
  updater: (tasks: BatchTaskItem[]) => BatchTaskItem[]
) {
  setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, tasks: updater(item.tasks || []) } : item)));
}

async function runSelectedShots(
  item: BatchProductItem,
  shots: ShotPrompt[],
  config: TaskExecutionConfig,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  bumpProgress: (ok: boolean, n?: number) => void
) {
  for (const shot of shots) {
    const liveTask = (item.tasks || []).find((task) => task.shot_no === shot.shot_no);
    if (liveTask && !needsGenerationSubmit(liveTask)) {
      bumpProgress(true, 1);
      continue;
    }
    patchItemTasks(setItems, item.id, (tasks) =>
      tasks.map((task) => (task.shot_no === shot.shot_no ? { ...task, status: 'IN_PROGRESS', error: undefined } : task))
    );
    try {
      const generated = await executeSingleImageTask(item, shot, undefined, {
        ...config,
        idempotencyKey: liveTask?.idempotencyKey || config.idempotencyKey,
      });
      patchItemTasks(setItems, item.id, (tasks) =>
        tasks.map((task) =>
          task.shot_no === shot.shot_no
            ? { ...task, status: 'SUCCESS', resultUrl: generated.url, temporaryUrl: generated.temporary, error: undefined }
            : task
        )
      );
      bumpProgress(true, 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '生图失败';
      patchItemTasks(setItems, item.id, (tasks) =>
        tasks.map((task) =>
          task.shot_no === shot.shot_no ? { ...task, status: 'FAILURE', error: message } : task
        )
      );
      bumpProgress(false, 1);
    }
  }
}

export async function startBatchGenerationCoordinator(deps: BatchCoordinatorDeps): Promise<void> {
  if (generationLock) return;

  const {
    config,
    imageGenConcurrency,
    itemsRef,
    setItems,
    runControlRef,
    batchId,
    storyboardRevision,
    showToast,
    setCurrentStage,
    setIsGeneratingBatch,
    setTotalTaskCount,
    setCompletedTaskCount,
    setSuccessTaskCount,
    setFailTaskCount,
    autoGenerateCopywriting,
    generateAllCopywriting,
  } = deps;

  const latestSuccessful = itemsRef.current.filter((item) => item.status === 'success' && item.selected);
  if (latestSuccessful.length === 0) {
    showToast('没有待生成的商品');
    return;
  }
  if (hasRecoveryRequired(latestSuccessful)) {
    showToast('存在未核验的恢复任务，请先确认后再生图');
    return;
  }

  const notReady = latestSuccessful.filter(
    (item) => !item.analyzedSuccess || !item.prompts || item.prompts.length === 0
  );
  if (notReady.length > 0) {
    showToast(`🚨 生产安全阻断：有 ${notReady.length} 款商品尚未完成「AI 提示词分析」，严禁启动生图队列！请先在步骤3完成分析`);
    return;
  }

  generationLock = true;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    setItems((prev) =>
      prev.map((item) => {
        if (!(item.selected && item.status === 'success')) return item;
        return {
          ...item,
          tasks: mergeGenerationTasks(item, {
            batchId,
            storyboardRevision,
            model: config.selectedImageGenModel,
            aspectRatio: config.selectedAspect,
            quality: config.selectedQuality,
          }),
        };
      })
    );

    setCurrentStage(4);
    setIsGeneratingBatch(true);
    runControlRef.current = { status: 'running' };

    const totalSlices = latestSuccessful.reduce((sum, item) => sum + selectedShots(item).length, 0);
    setTotalTaskCount(totalSlices);
    setCompletedTaskCount(0);
    setSuccessTaskCount(0);
    setFailTaskCount(0);

    const bumpProgress = (ok: boolean, n = 1) => {
      completed += n;
      if (ok) successCount += n;
      else failCount += n;
      setCompletedTaskCount(Math.min(completed, totalSlices));
      setSuccessTaskCount(successCount);
      setFailTaskCount(failCount);
    };

    const isAborted = () => runControlRef.current.status === 'cancelled';
    const isPaused = () => runControlRef.current.status === 'paused';
    const taskConfig = { ...config, isAborted, isPaused };

    const concurrency = Math.min(imageGenConcurrency || 4, latestSuccessful.length);
    await runBatchGenerationWorkers({
      items: latestSuccessful,
      concurrency,
      isAborted,
      generateItem: async (currentItem) => {
        const live = itemsRef.current.find((item) => item.id === currentItem.id) || currentItem;
        const shots = selectedShots(live);
        const pendingShots = shots.filter((shot) => {
          const task = (live.tasks || []).find((entry) => entry.shot_no === shot.shot_no);
          return !task || needsGenerationSubmit(task);
        });
        if (pendingShots.length === 0) {
          bumpProgress(true, shots.length);
          return;
        }
        await runSelectedShots(live, pendingShots, {
          ...taskConfig,
          idempotencyKey: live.tasks.find((task) => pendingShots.some((shot) => shot.shot_no === task.shot_no))?.idempotencyKey,
        }, setItems, bumpProgress);
      },
    });

    if (isAborted()) {
      showToast('已停止批量生图');
      return;
    }

    if (autoGenerateCopywriting) {
      void generateAllCopywriting();
    }
    if (failCount === 0) {
      showToast(`批量生图全部完成！成功 ${successCount} 张 / ${latestSuccessful.length} 款商品${autoGenerateCopywriting ? '，正在生成文案' : '；文案自动生成已关闭，可在交付页手动生成'}`);
    } else if (successCount === 0) {
      showToast(`批量生图全部失败（${failCount} 张）。请查看失败原因后重试`);
    } else {
      showToast(`批量生图结束：成功 ${successCount} 张，失败 ${failCount} 张`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    showToast(`队列异常：${message}`);
  } finally {
    generationLock = false;
    setIsGeneratingBatch(false);
  }
}

export async function retryFailedImageTasksCoordinator(
  deps: BatchCoordinatorDeps,
  successfulItems: BatchProductItem[],
  isGeneratingBatch: boolean
): Promise<void> {
  if (isGeneratingBatch || generationLock) return;
  if (hasRecoveryRequired(successfulItems)) {
    deps.showToast('存在未核验的恢复任务，请先确认后再重试');
    return;
  }

  const { config, imageGenConcurrency, setItems, runControlRef, showToast, setIsGeneratingBatch, setTotalTaskCount, setCompletedTaskCount, setSuccessTaskCount, setFailTaskCount } = deps;
  const failedItems = successfulItems.filter((item) => (item.tasks || []).some((task) => task.status === 'FAILURE'));
  if (failedItems.length === 0) {
    showToast('没有失败的分镜需要重试');
    return;
  }

  generationLock = true;
  try {
    const failedTaskCount = failedItems.reduce(
      (n, item) => n + (item.tasks || []).filter((task) => task.status === 'FAILURE').length,
      0
    );
    setIsGeneratingBatch(true);
    runControlRef.current = { status: 'running' };
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
      prev.map((item) => {
        if (!failedItems.some((failed) => failed.id === item.id)) return item;
        return {
          ...item,
          tasks: (item.tasks || []).map((task) =>
            task.status === 'FAILURE' ? { ...task, status: 'IN_PROGRESS' as const, error: undefined } : task
          ),
        };
      })
    );

    const isAborted = () => runControlRef.current.status === 'cancelled';
    await runRetryFailedGenerationWorkers({
      items: failedItems,
      concurrency: Math.min(imageGenConcurrency || 4, failedItems.length),
      isAborted,
      retryItem: async (currentItem) => {
        const failedShots = (currentItem.tasks || [])
          .filter((task) => task.status === 'FAILURE' || task.status === 'IN_PROGRESS')
          .map((task) => findShotByNo(currentItem, task.shot_no))
          .filter((shot): shot is ShotPrompt => Boolean(shot));
        await runSelectedShots(currentItem, failedShots, {
          ...config,
          isAborted,
          isPaused: () => runControlRef.current.status === 'paused',
        }, setItems, bumpProgress);
      },
    });

    if (failCount === 0) showToast(`失败分镜重试完成：全部成功 ${successCount} 张`);
    else if (successCount === 0) showToast(`失败分镜重试仍全部失败（${failCount} 张）`);
    else showToast(`失败分镜重试结束：成功 ${successCount} 张，仍失败 ${failCount} 张`);
  } catch (err: unknown) {
    showToast(`队列异常：${err instanceof Error ? err.message : '未知错误'}`);
  } finally {
    generationLock = false;
    setIsGeneratingBatch(false);
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
  const targetItem = items.find((item) => item.id === itemId);
  if (!targetItem) return;
  const task = targetItem.tasks?.[shotIndex];
  const shot = findShotByNo(targetItem, task?.shot_no);
  if (!task || !shot) {
    showToast(`分镜 ${task?.shot_no || shotIndex + 1} 的提示词已不存在，无法重试`);
    return;
  }

  patchItemTasks(setItems, itemId, (tasks) =>
    tasks.map((entry, idx) => (idx === shotIndex ? { ...entry, status: 'IN_PROGRESS', error: undefined } : entry))
  );

  try {
    const generated = await executeSingleImageTask(targetItem, shot, undefined, config);
    patchItemTasks(setItems, itemId, (tasks) =>
      tasks.map((entry, idx) =>
        idx === shotIndex ? { ...entry, status: 'SUCCESS', resultUrl: generated.url, temporaryUrl: generated.temporary, error: undefined } : entry
      )
    );
    showToast(`分镜 ${shot.shot_no} 重新生成成功！`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '重试失败';
    patchItemTasks(setItems, itemId, (tasks) =>
      tasks.map((entry, idx) => (idx === shotIndex ? { ...entry, status: 'FAILURE', error: message } : entry))
    );
    showToast(`分镜 ${shot.shot_no} 重试失败: ${message}`);
  }
}
