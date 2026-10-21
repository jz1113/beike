import { savedWorkshopOutputSize } from '../model/generation/generationHelpers';
import { prepareTaskRetry } from '../model/generation/generationHelpers';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { checkWorkshopReadiness } from '../model/generation/workshopReadiness';
import { runGridImageTask } from '../model/generation/batchGridGeneration';
import { runSelectedShots } from '../model/generation/batchSingleGeneration';
import type { ShotPrompt } from '@shared/domain/prompts/vision';
import type { BatchProductItem, BatchTaskItem, GenerationStrategy } from '../model/batchTypes';
import { runGenerationJobs } from '../model/generation/generationHelpers';
import { buildBatchGenerationJobs } from '../model/generation/generationHelpers';
import {
  executeSingleImageTask,
  type TaskExecutionConfig,
} from '../model/generation/batchTaskExecution';
import { mergeGenerationTasks, needsGenerationSubmit } from '../model/generation/mergeGenerationTasks';
import type { RunControl } from '../model/workspace/runControl';

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
  createCheckpoint: () => () => Promise<void>;
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

  const readiness = checkWorkshopReadiness(latestSuccessful, { generationStrategy: deps.generationStrategy, selectedShotCount: config.selectedShotCount });
  if (!readiness.canGenerate) {
    const issue = readiness.issues[0];
    showToast(`${issue.title}：${issue.reason}`);
    return;
  }

  generationLock = true;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    const mergedItems = itemsRef.current.map((item) => {
      if (!(item.selected && item.status === 'success')) return item;
      return {
        ...item,
        tasks: mergeGenerationTasks(item, {
          batchId,
          storyboardRevision,
          model: config.selectedImageGenModel,
          aspectRatio: config.selectedAspect,
          quality: config.selectedQuality,
          generationStrategy: deps.generationStrategy,
          gridOutputSize: config.gridOutputSize,
        }),
      };
    });
    itemsRef.current = mergedItems;
    setItems(mergedItems);

    setCurrentStage(4);
    setIsGeneratingBatch(true);
    runControlRef.current = { status: 'running' };

    const totalSlices = mergedItems.filter((item) => item.selected && item.status === 'success').reduce((sum, item) => {
      const shots = selectedShots(item);
      return sum + shots.filter((shot) => {
        const task = (item.tasks || []).find((entry) => entry.shot_no === shot.shot_no);
        return !task || needsGenerationSubmit(task);
      }).length;
    }, 0);
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
    const taskConfig = { ...config, isAborted, isPaused, beforeSubmit: deps.createCheckpoint() };
    await taskConfig.beforeSubmit();

    const jobs = buildBatchGenerationJobs(
      mergedItems.filter((item) => item.selected && item.status === 'success'), deps.generationStrategy,
    );
    await runGenerationJobs({
      jobs, concurrency: imageGenConcurrency || 4, isAborted, isPaused,
      execute: async ({ item, shots }) => {
        const execute = deps.generationStrategy === 'grid_first' ? runGridImageTask : runSelectedShots;
        await execute(item, shots, {
          ...taskConfig,
          idempotencyKey: item.tasks.find((task) => shots.some((shot) => shot.shot_no === task.shot_no))?.idempotencyKey,
        }, setItems, bumpProgress);
      },
    });

    if (isAborted()) {
      showToast('已停止批量生图。已经提交到上游的任务仍可能完成并计费');
      return;
    }
    await taskConfig.beforeSubmit();

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

  const { config, imageGenConcurrency, itemsRef, setItems, runControlRef, showToast, setIsGeneratingBatch, setTotalTaskCount, setCompletedTaskCount, setSuccessTaskCount, setFailTaskCount } = deps;
  const failedItems = successfulItems.filter((item) => (item.tasks || []).some((task) => task.status === 'FAILURE' && task.resultStatus !== 'superseded'));
  if (failedItems.length === 0) {
    showToast('没有失败的分镜需要重试');
    return;
  }

  const readiness = checkWorkshopReadiness(failedItems, { generationStrategy: deps.generationStrategy, selectedShotCount: config.selectedShotCount });
  if (!readiness.canGenerate) {
    showToast(`暂不能重试：${readiness.issues[0]?.reason || '请检查商品配置'}`);
    return;
  }

  generationLock = true;
  try {
    const failedTaskCount = failedItems.reduce(
      (n, item) => n + (item.tasks || []).filter((task) => task.status === 'FAILURE' && task.resultStatus !== 'superseded').length,
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

    const preparedItems = failedItems.map((item) => ({ ...item, masterGridUrl: undefined,
      tasks: item.tasks.map(task => task.status === 'FAILURE' && task.resultStatus !== 'superseded'
        ? prepareTaskRetry(task) : task),
    }));
    const preparedById = new Map(preparedItems.map((item) => [item.id, item]));
    const nextItems = itemsRef.current.map((item) => preparedById.get(item.id) || item);
    itemsRef.current = nextItems;
    setItems(nextItems);
    const beforeSubmit = deps.createCheckpoint();
    await beforeSubmit();

    const isAborted = () => runControlRef.current.status === 'cancelled';
    const isPaused = () => runControlRef.current.status === 'paused';
    // 只调度本次选中的失败镜头，避免顺带提交其他未运行任务。
    const jobs = buildBatchGenerationJobs(preparedItems.map((item) => {
      const failed = failedItems.find((entry) => entry.id === item.id)!;
      const failedShotNumbers = new Set(failed.tasks.filter((task) => task.status === 'FAILURE' && task.resultStatus !== 'superseded').map((task) => task.shot_no));
      return { ...item, prompts: item.prompts.filter((shot) => failedShotNumbers.has(shot.shot_no)) };
    }), deps.generationStrategy);
    await runGenerationJobs({
      jobs, concurrency: imageGenConcurrency || 4, isAborted, isPaused,
      execute: async ({ item, shots }) => {
        const live = preparedById.get(item.id) || item;
        const execute = deps.generationStrategy === 'grid_first' ? runGridImageTask : runSelectedShots;
        await execute(live, shots, {
          ...config, isAborted, isPaused, beforeSubmit,
          idempotencyKey: live.tasks.find((task) => shots.some((shot) => shot.shot_no === task.shot_no))?.idempotencyKey,
        }, setItems, bumpProgress);
      },
    });
    if (isAborted()) {
      showToast('已停止重试，已经提交的任务仍可能完成并计费');
      return;
    }
    await beforeSubmit();

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
  showToast: (msg: string) => void,
  createCheckpoint: () => () => Promise<void>,
): Promise<void> {
  if (generationLock) {
    showToast('已有生图任务进行中，请等当前生成结束后再重试单镜');
    return;
  }
  const targetItem = items.find((item) => item.id === itemId);
  if (!targetItem) return;
  const task = targetItem.tasks?.[shotIndex];
  const shot = findShotByNo(targetItem, task?.shot_no);
  if (!task || !shot) {
    showToast(`分镜 ${task?.shot_no || shotIndex + 1} 的提示词已不存在，无法重试`);
    return;
  }

  if (task.status === 'IN_PROGRESS') {
    showToast('该分镜正在生成，请勿重复提交');
    return;
  }
  if (task.recoveryRequired) {
    showToast('请先核对原任务；如需放弃恢复，请明确确认重复计费风险');
    return;
  }
  if (!targetItem.analyzedSuccess || !shot.prompt?.trim()) {
    showToast('请先重新分析或补充分镜提示词，再重试');
    return;
  }
  generationLock = true;
  const prepared = prepareTaskRetry(task);
  const { attempt, idempotencyKey } = prepared;
  patchItemTasks(setItems, itemId, (tasks) =>
    tasks.map((entry, idx) => (idx === shotIndex ? { ...prepared, status: 'IN_PROGRESS' } : entry))
  );

  let generationCompleted = false;
  try {
    const beforeSubmit = createCheckpoint();
    await beforeSubmit();
    const generated = await executeSingleImageTask(targetItem, shot, config.anchorFaceUrl, { ...config, idempotencyKey, outputSize: savedWorkshopOutputSize(task),
      beforeSubmit,
      onOutputSizeResolved: (outputSize) => patchItemTasks(setItems, itemId, (tasks) => tasks.map((entry) => entry.id === task.id && entry.idempotencyKey === idempotencyKey ? { ...entry, outputSize } : entry)),
      onGenerationSizeResolved: (generationSize) => patchItemTasks(setItems, itemId, (tasks) => tasks.map((entry) => entry.id === task.id && entry.idempotencyKey === idempotencyKey ? { ...entry, generationSize } : entry)),
      onTaskSubmitted: async (upstreamTaskId) => {
        patchItemTasks(setItems, itemId, (tasks) => tasks.map((entry) => entry.id === task.id && entry.idempotencyKey === idempotencyKey ? { ...entry, upstreamTaskId } : entry));
        await beforeSubmit();
      },
    });
    generationCompleted = true;
    patchItemTasks(setItems, itemId, (tasks) =>
      tasks.map((entry) =>
        entry.id === task.id && entry.idempotencyKey === idempotencyKey ? { ...entry, status: 'SUCCESS', resultUrl: generated.url, temporaryUrl: generated.temporary, error: undefined, recoveryRequired: false, attempt, idempotencyKey } : entry
      )
    );
    await beforeSubmit();
    showToast(`分镜 ${shot.shot_no} 重新生成成功！`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '重试失败';
    patchItemTasks(setItems, itemId, (tasks) =>
      tasks.map((entry) => (entry.id === task.id && entry.idempotencyKey === idempotencyKey ? { ...entry, status: 'FAILURE', error: message, recoveryRequired: generationCompleted || requiresGenerationRecovery(err) } : entry))
    );
    showToast(`分镜 ${shot.shot_no} 重试失败: ${message}`);
  } finally {
    generationLock = false;
  }
}
