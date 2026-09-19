import { imageTasks } from '../repositories/generate';

export async function recoverOrphanUnsubmittedTasks(): Promise<number> {
  const result = await imageTasks.failOrphanUnsubmitted();
  return result.count;
}
