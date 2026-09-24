import type { BatchTaskItem } from './batchTypes';

/** 已失败、或显式恢复时，优先用任务上的原图，再退回商品级四宫格原图。 */
export function resolveGridRecoverySource(input: {
  recoveryOnly: boolean;
  masterGridUrl?: string;
  tasks: Pick<BatchTaskItem, 'shot_no' | 'status' | 'gridSourceUrl'>[];
  pendingShotNos: number[];
}): string | undefined {
  const pending = new Set(input.pendingShotNos);
  const stored = input.tasks.find((task) => pending.has(task.shot_no) && task.gridSourceUrl)?.gridSourceUrl;
  if (stored) return stored;
  const failed = input.tasks.some((task) => pending.has(task.shot_no) && task.status === 'FAILURE');
  if ((input.recoveryOnly || failed) && input.masterGridUrl) return input.masterGridUrl;
  return undefined;
}
