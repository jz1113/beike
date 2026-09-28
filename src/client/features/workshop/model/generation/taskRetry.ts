import { savedWorkshopOutputSize } from './workshopOutputSize';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';

/** Explicit new attempt: never inherit an old upstream/grid result or approval. */
export function prepareTaskRetry(task: BatchTaskItem): BatchTaskItem {
  const attempt = (task.attempt || 0) + 1;
  const base = (task.idempotencyKey || task.id).replace(/:a\d+$/, '');
  return {
    ...task, status: 'PENDING', error: undefined, recoveryRequired: false,
    attempt, idempotencyKey: `${base}:a${attempt}`, upstreamTaskId: undefined,
    gridTaskKey: undefined, gridSourceUrl: undefined, gridSize: undefined, outputSize: savedWorkshopOutputSize(task),
    resultUrl: undefined, temporaryUrl: false, outputReview: 'unreviewed',
    resultStatus: 'current',
  };
}

/** Only called after the user explicitly accepts possible duplicate billing. */
export function acknowledgeUncertainTasks(items: BatchProductItem[]): BatchProductItem[] {
  return items.map(item => {
    if (!item.selected || !item.tasks.some(task => task.recoveryRequired)) return item;
    return { ...item, masterGridUrl: undefined, tasks: item.tasks.map(task => task.recoveryRequired
      ? { ...task, recoveryRequired: false, gridTaskKey: undefined, gridSourceUrl: undefined,
        gridSize: undefined, outputSize: savedWorkshopOutputSize(task), upstreamTaskId: undefined, error: '已确认放弃原结果，可手动重新生成' }
      : task) };
  });
}
