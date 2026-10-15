import type { ChatSession, GenerationTask } from '../appStoreTypes';
import type { DrawingSnapshot } from './generationSnapshotTypes';
import { isSessionDeleted, isGenerationDeleted } from './generationTombstones';

function changedFields<T extends object>(base: T, next: T, remote: T, skip: Array<keyof T> = []): T {
  const merged = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const field = key as keyof T;
    if (skip.includes(field) || base[field] === next[field]) continue;
    if (JSON.stringify(base[field]) !== JSON.stringify(next[field])) merged[field] = next[field];
  }
  return merged;
}

/** Apply only this tab's edits; unseen additions survive and remote deletions cannot be resurrected. */
function mergeRows<T extends { id: string }>(base: T[], next: T[], remote: T[], merge: (base: T, next: T, remote: T) => T): T[] {
  const before = new Map(base.map(row => [row.id, row]));
  const after = new Map(next.map(row => [row.id, row]));
  const saved = new Set(remote.map(row => row.id));
  const rows: T[] = [];
  for (const row of remote) {
    const local = after.get(row.id);
    const previous = before.get(row.id);
    if (local) rows.push(previous ? merge(previous, local, row) : { ...row, ...local });
    else if (!previous) rows.push(row);
  }
  for (const row of next) if (!saved.has(row.id) && !before.has(row.id)) rows.push(row);
  return rows;
}

function mergeTask(base: GenerationTask, next: GenerationTask, remote: GenerationTask): GenerationTask {
  const merged = changedFields(base, next, remote);
  if (remote.status === 'SUCCESS' && remote.resultUrl && merged.status !== 'SUCCESS') {
    return { ...merged, status: 'SUCCESS', resultUrl: remote.resultUrl, progress: '100%', failReason: undefined, submissionRecoveryRequired: false };
  }
  return merged;
}

function mergeSession(base: ChatSession, next: ChatSession, remote: ChatSession): ChatSession {
  return { ...changedFields(base, next, remote, ['tasks']), tasks: mergeRows(base.tasks, next.tasks, remote.tasks, mergeTask) };
}

export function mergeDrawingSnapshots(base: DrawingSnapshot, next: DrawingSnapshot, remote: DrawingSnapshot): DrawingSnapshot {
  const rawSessions = mergeRows(base.sessions, next.sessions, remote.sessions, mergeSession);
  const sessions = rawSessions
    .filter((session) => !isSessionDeleted(session.id))
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || b.createdAt - a.createdAt);
  const rawTasks = mergeRows(base.tasks, next.tasks, remote.tasks, mergeTask);
  const tasks = rawTasks.filter((task) => !isGenerationDeleted(task.id, task.taskId, task.resultUrl, task.dbId));
  const selected = base.currentId !== next.currentId ? next.currentId : remote.currentId;
  return {
    sessions,
    tasks,
    currentId: sessions.some(session => session.id === selected) ? selected : sessions[0]?.id || 'session-default',
    updatedAt: Math.max(next.updatedAt, remote.updatedAt + 1),
  };
}
