import { imageTasks } from '../../repositories/generate';
import { staleSubmittedTaskCutoff } from './taskRecoveryPolicy';

export async function recoverOrphanUnsubmittedTasks(): Promise<number> {
  const orphaned = await imageTasks.failOrphanUnsubmitted();
  const stale = await imageTasks.failStaleSubmitted(staleSubmittedTaskCutoff());
  return orphaned.count + stale.count;
}
