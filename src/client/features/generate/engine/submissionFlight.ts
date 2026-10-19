const inflightSubmissionIds = new Set<string>();

/** 同一本地任务在原请求返回前只能占一个名额，避免刷新或重渲染再交一次。 */
export function claimSubmissionFlight(taskId: string): boolean {
  if (inflightSubmissionIds.has(taskId)) return false;
  inflightSubmissionIds.add(taskId);
  return true;
}

export function releaseSubmissionFlight(taskId: string): void {
  inflightSubmissionIds.delete(taskId);
}

export function isSubmissionInFlight(taskId: string): boolean {
  return inflightSubmissionIds.has(taskId);
}

/** 原请求还在飞时不能把「还没有记录」当成提交失败。 */
export function shouldAbandonSubmissionRecovery(count: number, inFlight: boolean): boolean {
  return !inFlight && count > 5;
}
