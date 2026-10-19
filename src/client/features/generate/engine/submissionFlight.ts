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

export const SUBMISSION_RECOVERY_TIMEOUT =
  '原任务核对超时：未在服务端找到记录，任务可能已被拒绝或网络中断。请检查服务接口配置后重试。';

const submissionRequestErrors = new Map<string, string>();

export function rememberSubmissionRequestError(taskId: string, message: string): void {
  const text = message.trim();
  if (text) submissionRequestErrors.set(taskId, text);
}

export function submissionRequestError(taskId: string): string | undefined {
  return submissionRequestErrors.get(taskId);
}

export function forgetSubmissionRequestError(taskId: string): void {
  submissionRequestErrors.delete(taskId);
}

export type SubmissionRecoveryObservation = 'inflight' | 'pending' | 'missing';

/** 服务端还在提交时不累计核对次数；只有确认没有记录才熔断，并保留本次请求的真实错误。 */
export function nextSubmissionRecovery(
  count: number,
  observation: SubmissionRecoveryObservation,
  requestError?: string,
): { count: number; abandon: boolean; reason?: string } {
  if (observation === 'inflight' || observation === 'pending') {
    return { count: 0, abandon: false };
  }
  const next = count + 1;
  if (next > 5) {
    const reason = requestError?.trim() || SUBMISSION_RECOVERY_TIMEOUT;
    return { count: next, abandon: true, reason };
  }
  return { count: next, abandon: false };
}
