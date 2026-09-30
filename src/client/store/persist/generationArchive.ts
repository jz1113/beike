import { openDB } from 'idb';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { registerRefMedia, resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';
import { mergeDrawingSnapshots } from './generationSnapshotMerge';
import type { DrawingSnapshot } from './generationSnapshotTypes';
export type { DrawingSnapshot } from './generationSnapshotTypes';

const MEDIA_FIELDS = ['resultUrl', 'productImageUrl', 'referenceImageUrl', 'sourceImageUrl'] as const;
const MEDIA_ARRAY_FIELDS = ['referenceImages', 'images'] as const;
type Archive = { snapshot: DrawingSnapshot; files: Array<[string, File]> };
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
    const merged = base && saved ? mergeDrawingSnapshots(base, snapshot, saved.snapshot) : snapshot;
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
    const inputs = [task.referenceImageUrl, task.productImageUrl, task.sourceImageUrl, ...(task.referenceImages || []), ...(task.images || [])];
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
    for (const field of MEDIA_FIELDS) if (!next[field] && archived[field]) next[field] = archived[field];
    // Attempts have immutable input IDs. Restore the full slot order when the light cache omitted local media.
    for (const field of MEDIA_ARRAY_FIELDS) {
      if ((archived[field]?.length || 0) > (next[field]?.length || 0)) next[field] = archived[field];
    }
    next.referenceMediaMissing = archived.referenceMediaMissing;
    return next;
  };
  return { ...snapshot, tasks: snapshot.tasks.map(restore), sessions: snapshot.sessions.map(session => ({ ...session, tasks: session.tasks.map(restore) })) };
}
