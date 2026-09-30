import type { GenerationTask } from './appStoreTypes';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';

/** 已结束任务的内存预算；进行中的任务始终保留。 */
export const MAX_GENERATION_TASKS_IN_MEMORY = 200;

/** localStorage 启动恢复时首屏任务条数（不含大 resultUrl） */
export const STARTUP_TASK_SUMMARY_COUNT = 20;

export function retainGenerationTasks(tasks: GenerationTask[], limit = MAX_GENERATION_TASKS_IN_MEMORY): GenerationTask[] {
  const active = tasks.filter(task => isImageTaskActive(task.status));
  const recent = new Set(tasks.filter(task => !isImageTaskActive(task.status)).slice(0, Math.max(0, limit - active.length)));
  return tasks.filter(task => isImageTaskActive(task.status) || recent.has(task));
}
