import {
  computeInvalidation,
  shouldInvalidateTarget,
  type InvalidationChange,
} from '@shared/domain/workshop/workshopPipeline';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';

export function applyInvalidationToItems(
  items: BatchProductItem[],
  change: InvalidationChange,
): BatchProductItem[] {
  const effect = computeInvalidation(change);
  return items.map((item) => {
    if (change.productId && item.id !== change.productId) return item;
    const prompts = (item.prompts || []).map((prompt) => {
      if (!shouldInvalidateTarget(effect.storyboard, { shotNo: prompt.shot_no }, change)) return prompt;
      return {
        ...prompt,
        resultStatus: 'superseded' as const,
        revision: ((prompt as { revision?: number }).revision || 0) + 1,
      };
    });
    const tasks = (item.tasks || []).map((task) => {
      if (!shouldInvalidateTarget(effect.tasks, {
        shotNo: task.shot_no,
        generated: task.status === 'SUCCESS' && Boolean(task.resultUrl),
      }, change)) {
        return task;
      }
      return { ...task, resultStatus: 'superseded' as const };
    });
    const copywriting = shouldInvalidateTarget(effect.copywriting, { shotNo: change.shotNo }, change)
      ? undefined
      : item.copywriting;
    const analyzedSuccess = effect.storyboard === 'all' ? false : item.analyzedSuccess;
    const nextPrompts = effect.storyboard === 'all' ? [] : prompts;
    return {
      ...item,
      prompts: nextPrompts,
      tasks,
      copywriting,
      analyzedSuccess,
      analysisError: effect.storyboard === 'all' ? undefined : item.analysisError,
    };
  });
}

export function currentTasks(tasks: BatchTaskItem[] | undefined): BatchTaskItem[] {
  return (tasks || []).filter((task) => task.resultStatus !== 'superseded');
}
