import { requireWorkspaceId } from '@beike/server-kit/workspaceContext';

export type DeconstructProgress = {
  stage: 'preparing' | 'queued' | 'analyzing' | 'retry_wait' | 'reconciling' | 'saving' | 'completed' | 'failed';
  message: string;
  startedAt: number;
  updatedAt: number;
};

const progressByTask = new Map<string, DeconstructProgress>();
const PROGRESS_TTL_MS = 10 * 60_000;
const progressKey = (taskId: string) => `${requireWorkspaceId()}:${taskId}`;

export function updateDeconstructProgress(
  taskId: string | undefined,
  stage: DeconstructProgress['stage'],
  message: string,
): void {
  if (!taskId) return;
  const key = progressKey(taskId);
  const now = Date.now();
  const previous = progressByTask.get(key);
  progressByTask.set(key, {
    stage,
    message,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  });
  if (stage === 'completed' || stage === 'failed') {
    const completedAt = now;
    setTimeout(() => {
      if (progressByTask.get(key)?.updatedAt === completedAt) progressByTask.delete(key);
    }, PROGRESS_TTL_MS).unref?.();
  }
}

export function getDeconstructProgress(taskId: string): DeconstructProgress | null {
  return progressByTask.get(progressKey(taskId)) ?? null;
}
