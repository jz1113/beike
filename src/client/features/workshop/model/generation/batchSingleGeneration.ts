import { savedWorkshopOutputSize } from './generationHelpers';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { waitWhilePaused } from '@client/shared/api/generation/generationAbort';
import type { ShotPrompt } from '@shared/domain/prompts/vision';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import { executeSingleImageTask, type TaskExecutionConfig } from './batchTaskExecution';

function patchItemTasks(
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  itemId: string,
  updater: (tasks: BatchTaskItem[]) => BatchTaskItem[]
) {
  setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, tasks: updater(item.tasks || []) } : item)));
}

export async function runSelectedShots(
  item: BatchProductItem,
  shots: ShotPrompt[],
  config: TaskExecutionConfig,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  bumpProgress: (ok: boolean, n?: number) => void
) {
  for (const shot of shots) {
    if (config.isAborted()) break;
    if (config.isPaused) await waitWhilePaused(config.isPaused, config.isAborted);
    if (config.isAborted()) break;
    const liveTask = (item.tasks || []).find((task) => task.shot_no === shot.shot_no);
    if (liveTask?.status === 'SUCCESS' && liveTask.resultUrl) {
      bumpProgress(true, 1);
      continue;
    }
    patchItemTasks(setItems, item.id, (tasks) =>
      tasks.map((task) => (task.shot_no === shot.shot_no ? { ...task, status: 'IN_PROGRESS', error: undefined } : task))
    );
    try {
      const generated = await executeSingleImageTask(item, shot, config.anchorFaceUrl, {
        ...config,
        outputSize: savedWorkshopOutputSize(liveTask),
        idempotencyKey: liveTask?.idempotencyKey || config.idempotencyKey,
        onLearningContextResolved: (learningContext) => patchItemTasks(setItems, item.id, (tasks) => tasks.map((task) => task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey ? { ...task, learningContext } : task)),
        onOutputSizeResolved: (outputSize) => patchItemTasks(setItems, item.id, (tasks) => tasks.map((task) => task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey ? { ...task, outputSize } : task)),
        onGenerationSizeResolved: (generationSize) => patchItemTasks(setItems, item.id, (tasks) => tasks.map((task) => task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey ? { ...task, generationSize } : task)),
        onTaskSubmitted: async (upstreamTaskId) => {
          patchItemTasks(setItems, item.id, (tasks) => tasks.map((task) => task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey ? { ...task, upstreamTaskId } : task));
          await config.beforeSubmit?.();
        },
      });
      patchItemTasks(setItems, item.id, (tasks) =>
        tasks.map((task) =>
          task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey
            ? { ...task, status: 'SUCCESS', resultUrl: generated.url, temporaryUrl: generated.temporary, error: undefined, recoveryRequired: false }
            : task
        )
      );
      bumpProgress(true, 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '生图失败';
      patchItemTasks(setItems, item.id, (tasks) =>
        tasks.map((task) =>
          task.shot_no === shot.shot_no && task.idempotencyKey === liveTask?.idempotencyKey ? { ...task, status: 'FAILURE', error: message, recoveryRequired: requiresGenerationRecovery(err) } : task
        )
      );
      bumpProgress(false, 1);
    }
  }
}
