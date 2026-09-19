import type { GenerationTask } from '@/types/app-store';
import { isLocalUnsubmittedTask } from './generationTaskPolling';

export const GENERATION_CONCURRENCY = 10;

export function selectGenerationSlots(tasks: GenerationTask[], submitting: ReadonlySet<string>): GenerationTask[] {
  const occupied = new Set(submitting);
  for (const task of tasks) {
    if (task.status === 'IN_PROGRESS' && task.taskId && !task.resultUrl) occupied.add(task.id);
  }
  const available = Math.max(0, GENERATION_CONCURRENCY - occupied.size);
  return tasks.filter(task => !occupied.has(task.id) && isLocalUnsubmittedTask(task)).slice(0, available);
}
