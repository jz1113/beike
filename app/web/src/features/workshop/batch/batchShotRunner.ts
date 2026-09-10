import type { ShotPrompt } from '@beike/shared/vision';
import type { BatchProductItem, BatchTaskItem } from './batchTypes';

export interface SingleShotRunnerDeps {
  hasHumanPersona: boolean;
  isAborted: () => boolean;
  executeSingleImageTask: (
    item: BatchProductItem,
    shot: ShotPrompt,
    anchorFaceUrl?: string
  ) => Promise<string | undefined>;
  updateItemTasks: (
    itemId: string,
    updater: (tasks: BatchTaskItem[]) => BatchTaskItem[]
  ) => void;
  bumpProgress: (ok: boolean, n?: number) => void;
}

/** 单张分镜模式：先跑分镜 1 锚点，再并行跑 2–4 */
export async function runSingleShotGeneration(
  currentItem: BatchProductItem,
  currentItemId: string,
  effectivePrompts: ShotPrompt[],
  deps: SingleShotRunnerDeps,
  opts?: { onlyFailedIndices?: number[] }
): Promise<void> {
  const {
    hasHumanPersona,
    isAborted,
    executeSingleImageTask,
    updateItemTasks,
    bumpProgress,
  } = deps;

  const onlyFailed = opts?.onlyFailedIndices;
  const shouldRunShot = (idx: number) => !onlyFailed || onlyFailed.includes(idx);

  const shot1 = effectivePrompts[0] || {
    shot_no: 1,
    title: '分镜 1: 自然生活肖像',
    prompt: currentItem.prompts[0]?.prompt || '',
    has_human: hasHumanPersona,
  };

  let shot1Url = currentItem.tasks[0]?.status === 'SUCCESS' ? currentItem.tasks[0]?.resultUrl : undefined;

  if (shouldRunShot(0) && (!shot1Url || currentItem.tasks[0]?.status === 'FAILURE' || currentItem.tasks[0]?.status === 'IN_PROGRESS')) {
    updateItemTasks(currentItemId, (tasks) =>
      tasks.map((t, idx) => (idx === 0 ? { ...t, status: 'IN_PROGRESS', error: undefined } : t))
    );

    for (let shot1Attempt = 0; shot1Attempt < 2; shot1Attempt++) {
      try {
        shot1Url = await executeSingleImageTask(currentItem, shot1, undefined);
        if (shot1Url) break;
      } catch (shot1Err: unknown) {
        if (shot1Attempt === 0 && !isAborted()) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        const msg = shot1Err instanceof Error ? shot1Err.message : '分镜 1 生图失败';
        updateItemTasks(currentItemId, (tasks) => {
          const updated = [...tasks];
          if (updated[0]) updated[0] = { ...updated[0], status: 'FAILURE', error: msg };
          return updated;
        });
      }
    }

    if (shot1Url) {
      updateItemTasks(currentItemId, (tasks) => {
        const updated = [...tasks];
        if (updated[0]) {
          updated[0] = { ...updated[0], status: 'SUCCESS', resultUrl: shot1Url, error: undefined };
        }
        return updated;
      });
      bumpProgress(true, 1);
    } else {
      bumpProgress(false, 1);
    }
  }

  const anchorFaceForNextShots = hasHumanPersona && shot1Url ? shot1Url : undefined;
  const remainingIndices = [1, 2, 3].filter((idx) => shouldRunShot(idx));

  if (remainingIndices.length > 0) {
    updateItemTasks(currentItemId, (tasks) =>
      tasks.map((t, idx) =>
        remainingIndices.includes(idx) ? { ...t, status: 'IN_PROGRESS', error: undefined } : t
      )
    );
  }

  await Promise.all(
    remainingIndices.map(async (shotIndex) => {
      const shot = effectivePrompts[shotIndex];
      if (!shot) return;

      let shotUrl: string | undefined;
      for (let shotAttempt = 0; shotAttempt < 2; shotAttempt++) {
        try {
          shotUrl = await executeSingleImageTask(currentItem, shot, anchorFaceForNextShots);
          if (shotUrl) break;
        } catch (shotErr: unknown) {
          if (shotAttempt === 0 && !isAborted()) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          const msg = shotErr instanceof Error ? shotErr.message : '生图失败';
          updateItemTasks(currentItemId, (tasks) => {
            const updated = [...tasks];
            if (updated[shotIndex]) {
              updated[shotIndex] = { ...updated[shotIndex], status: 'FAILURE', error: msg };
            }
            return updated;
          });
        }
      }

      if (shotUrl) {
        updateItemTasks(currentItemId, (tasks) => {
          const updated = [...tasks];
          if (updated[shotIndex]) {
            updated[shotIndex] = {
              ...updated[shotIndex],
              status: 'SUCCESS',
              resultUrl: shotUrl,
              error: undefined,
            };
          }
          return updated;
        });
        bumpProgress(true, 1);
      } else if (currentItem.tasks[shotIndex]?.status !== 'SUCCESS') {
        bumpProgress(false, 1);
      }
    })
  );
}
