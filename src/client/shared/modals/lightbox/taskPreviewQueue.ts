import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';

/** Preserve queued IDs while replacing their snapshots with live conversation records. */
export function resolveTaskPreviewQueue(
  previewTask: GenerationTask | null,
  previewQueue: GenerationTask[],
  generationTasks: GenerationTask[],
  sessions: ChatSession[],
): GenerationTask[] {
  if (!previewTask) return [];
  const liveTasks = new Map<string, GenerationTask>();
  const queuedIds = new Set(previewQueue.map((task) => task.id));
  const remember = (task: GenerationTask) => {
    const wanted = previewQueue.length ? queuedIds.has(task.id) : task.id === previewTask.id ||
      Boolean(previewTask.batchId && task.batchId === previewTask.batchId);
    if (wanted) liveTasks.set(task.id, task);
  };
  for (const session of sessions) {
    for (const task of session.tasks) remember(task);
  }
  for (const task of generationTasks) remember(task);
  const source = previewQueue.length ? previewQueue : previewTask.batchId
    ? [...liveTasks.values()].filter((task) => task.batchId === previewTask.batchId) : [previewTask];
  const queue = source.length ? source : [previewTask];
  return queue.map((task) => liveTasks.get(task.id) || task);
}
