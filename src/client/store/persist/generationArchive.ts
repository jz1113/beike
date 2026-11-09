import { agentHistorySnapshot, type DrawingSnapshot } from '../agentHistory';
import { openDB } from 'idb';
import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { registerRefMedia, resolveRefMediaFile, unregisterRefMedia } from '@client/shared/media/refMediaRegistry';

export type { DrawingSnapshot };

export const generationDeletedKeys = new Set<string>();
const GENERATION_TOMBSTONE_KEY = 'drawing_deleted_keys';

export function isSessionDeleted(sessionId?: string | null): boolean {
  return Boolean(sessionId && generationDeletedKeys.has(`session:${sessionId}`));
}

export function markSessionDeleted(sessionId?: string | null) {
  if (!sessionId) return;
  generationDeletedKeys.add(`session:${sessionId}`);
  persistGenerationTombstones();
}

export function isGenerationDeleted(
  id?: string | null,
  taskId?: string | null,
  resultUrl?: string | null,
  dbId?: string | null,
): boolean {
  return [id, taskId, resultUrl, dbId].some((k) => k && generationDeletedKeys.has(k));
}

export function loadGenerationTombstones() {
  if (typeof window === 'undefined') return;
  try {
    const rawLocal = localStorage.getItem(GENERATION_TOMBSTONE_KEY);
    const rawSession = sessionStorage.getItem(GENERATION_TOMBSTONE_KEY);
    const raw = rawLocal || rawSession;
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach((k: string) => k && generationDeletedKeys.add(k));
  } catch {}
}

export function persistGenerationTombstones() {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify(Array.from(generationDeletedKeys).slice(-400));
    localStorage.setItem(GENERATION_TOMBSTONE_KEY, payload);
    sessionStorage.setItem(GENERATION_TOMBSTONE_KEY, payload);
  } catch {}
}

export function markGenerationDeleted(ids: string[], urls?: string[]) {
  (ids || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  (urls || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  persistGenerationTombstones();
}

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
  if (remote.status === 'SUCCESS' && remote.resultUrl) {
    // Late progress/query patches must not revive recovery on an already completed receipt.
    const resultUrl = merged.status === 'SUCCESS' && merged.resultUrl ? merged.resultUrl : remote.resultUrl;
    return { ...merged, status: 'SUCCESS', resultUrl, progress: '100%', failReason: undefined, submissionRecoveryRequired: false };
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

const MEDIA_FIELDS = ['resultUrl', 'productImageUrl', 'referenceImageUrl', 'sourceImageUrl', 'firstFrameImage', 'lastFrameImage'] as const;
const MEDIA_ARRAY_FIELDS = ['referenceImages', 'referenceVideoUrls', 'referenceAudioUrls', 'images'] as const;
type Archive = { snapshot: DrawingSnapshot; files: Array<[string, File]> };
export function revokeSnapshotBlobUrls(snapshot: Pick<DrawingSnapshot, 'tasks' | 'sessions'> | null | undefined): void {
  if (!snapshot) return;
  const seen = new Set<string>();
  const revoke = (url: string) => {
    if (url.startsWith('blob:') && !seen.has(url)) {
      seen.add(url);
      unregisterRefMedia(url);
      URL.revokeObjectURL(url);
    }
    return url;
  };
  snapshot.tasks.forEach(task => mapTaskMedia(task, revoke));
  snapshot.sessions.forEach(session => session.tasks.forEach(task => mapTaskMedia(task, revoke)));
}
const database = () => openDB('beike-generation-history', 1, {
  upgrade(db) { db.createObjectStore('snapshots'); },
});
type PendingWrite = {
  snapshot: DrawingSnapshot;
  base?: DrawingSnapshot;
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};
let pendingWrite: PendingWrite | null = null;
let writing = false;

export function hasDrawingArchive(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function mapTaskMedia(task: GenerationTask, map: (url: string) => string | undefined): GenerationTask {
  const next = { ...task };
  for (const field of MEDIA_FIELDS) {
    if (task[field]) next[field] = map(task[field]);
  }
  for (const field of MEDIA_ARRAY_FIELDS) {
    if (task[field]) next[field] = task[field].map(map).filter((url): url is string => Boolean(url));
  }
  return next;
}

async function writeArchive(snapshot: DrawingSnapshot, base?: DrawingSnapshot): Promise<void> {
  const files = new Map<string, File>();
  const collect = (url: string) => {
    const file = resolveRefMediaFile(url);
    if (file && url.startsWith('blob:')) files.set(url, file);
    return url;
  };
  snapshot.tasks.forEach(task => mapTaskMedia(task, collect));
  snapshot.sessions.forEach(session => session.tasks.forEach(task => mapTaskMedia(task, collect)));
  const db = await database();
  try {
    // A read/write transaction serializes writers from every tab, including simultaneous cache writes.
    const tx = db.transaction('snapshots', 'readwrite');
    const saved = await tx.store.get('current') as Archive | undefined;
    const merged = agentHistorySnapshot(base && saved ? mergeDrawingSnapshots(base, snapshot, saved.snapshot) : snapshot);
    const available = new Map([...(saved?.files || []), ...files]);
    const needed = new Set<string>();
    const collectNeeded = (url: string) => { needed.add(url); return url; };
    merged.tasks.forEach(task => mapTaskMedia(task, collectNeeded));
    merged.sessions.forEach(session => session.tasks.forEach(task => mapTaskMedia(task, collectNeeded)));
    await tx.store.put({ snapshot: merged, files: [...available].filter(([url]) => needed.has(url)) } satisfies Archive, 'current');
    await tx.done;
  } finally { db.close(); }
}

async function drainArchiveWrites() {
  if (writing) return;
  writing = true;
  try {
    while (pendingWrite) {
      const current = pendingWrite;
      pendingWrite = null;
      try {
        await writeArchive(current.snapshot, current.base);
        current.waiters.forEach(waiter => waiter.resolve());
      } catch (error) { current.waiters.forEach(waiter => waiter.reject(error)); }
    }
  } finally { writing = false; }
}

/** Coalesce waiting edits into one archive write; the earliest base retains all intervening changes. */
export function saveDrawingArchive(snapshot: DrawingSnapshot, base?: DrawingSnapshot): Promise<void> {
  if (!hasDrawingArchive()) return Promise.reject(new Error('当前浏览器不支持本地历史归档'));
  return new Promise((resolve, reject) => {
    if (pendingWrite) {
      pendingWrite.snapshot = snapshot;
      pendingWrite.waiters.push({ resolve, reject });
    } else pendingWrite = { snapshot, base, waiters: [{ resolve, reject }] };
    queueMicrotask(() => { void drainArchiveWrites(); });
  });
}

export async function readDrawingArchive(minUpdatedAt: number): Promise<DrawingSnapshot | null> {
  if (!hasDrawingArchive()) return null;
  const db = await database();
  let archive: Archive | undefined;
  try { archive = await db.get('snapshots', 'current'); } finally { db.close(); }
  if (!archive || archive.snapshot.updatedAt < minUpdatedAt) return null;
  const urls = new Map<string, string>();
  for (const [previousUrl, file] of archive.files) {
    const url = URL.createObjectURL(file);
    registerRefMedia(url, file);
    urls.set(previousUrl, url);
  }
  const restore = (task: GenerationTask) => {
    const inputs = [task.referenceImageUrl, task.productImageUrl, task.sourceImageUrl, task.firstFrameImage, task.lastFrameImage, ...(task.referenceImages || []), ...(task.referenceAudioUrls || []), ...(task.images || [])];
    const referenceMediaMissing = task.referenceMediaMissing || inputs.some(url => url?.startsWith('blob:') && !urls.has(url));
    return { ...mapTaskMedia(task, url => urls.get(url) || (url.startsWith('blob:') ? undefined : url)), referenceMediaMissing };
  };
  return {
    ...archive.snapshot,
    tasks: archive.snapshot.tasks.map(restore),
    sessions: archive.snapshot.sessions.map(session => ({ ...session, tasks: session.tasks.map(restore) })),
  };
}

/** A newer lightweight snapshot owns state; an older archive can still supply its unchanged task media. */
export function restoreArchivedMedia(snapshot: DrawingSnapshot, archive: DrawingSnapshot): DrawingSnapshot {
  const archivedTasks = new Map([...archive.tasks, ...archive.sessions.flatMap(session => session.tasks)].map(task => [task.id, task]));
  const restore = (task: GenerationTask) => {
    const archived = archivedTasks.get(task.id);
    if (!archived || archived.prompt !== task.prompt || archived.model !== task.model || archived.useReferenceImage !== task.useReferenceImage) return task;
    const next = { ...task };
    for (const field of MEDIA_FIELDS) if ((!next[field] || next[field]?.startsWith('blob:')) && archived[field]) next[field] = archived[field];
    // Attempts have immutable input IDs. Restore the full slot order when the light cache omitted local media.
    for (const field of MEDIA_ARRAY_FIELDS) {
      if ((archived[field]?.length || 0) > (next[field]?.length || 0)) next[field] = archived[field];
    }
    next.referenceMediaMissing = archived.referenceMediaMissing;
    return next;
  };
  return { ...snapshot, tasks: snapshot.tasks.map(restore), sessions: snapshot.sessions.map(session => ({ ...session, tasks: session.tasks.map(restore) })) };
}
