export const STALE_SUBMITTED_TASK_MS = 20 * 60 * 1000;

export function staleSubmittedTaskCutoff(now = Date.now()): Date {
  return new Date(now - STALE_SUBMITTED_TASK_MS);
}

export function isStaleSubmittedTask(
  record: { taskId?: string | null; status?: string | null; updatedAt?: Date | string | number | null },
  now = Date.now(),
): boolean {
  if (!record.taskId) return false;
  if (record.status !== 'IN_PROGRESS' && record.status !== 'PENDING') return false;
  const updatedAt = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
  return updatedAt > 0 && now - updatedAt >= STALE_SUBMITTED_TASK_MS;
}
