import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { isProjectAutosaveEnabled } from '@client/shared/utils/localStoragePrefs';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { retainGenerationTasks, STARTUP_TASK_SUMMARY_COUNT } from '../generationLimits';
import { hasDrawingArchive, mapTaskMedia, readDrawingArchive, restoreArchivedMedia, saveDrawingArchive, type DrawingSnapshot } from './generationArchive';
import { mergeDrawingSnapshots } from './generationSnapshotMerge';

export const generationDeletedKeys = new Set<string>();
const GENERATION_TOMBSTONE_KEY = 'drawing_deleted_keys';

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
    const raw = sessionStorage.getItem(GENERATION_TOMBSTONE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach((k: string) => k && generationDeletedKeys.add(k));
  } catch {}
}

function persistGenerationTombstones() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      GENERATION_TOMBSTONE_KEY,
      JSON.stringify(Array.from(generationDeletedKeys).slice(-200)),
    );
  } catch {}
}

export function markGenerationDeleted(ids: string[], urls?: string[]) {
  (ids || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  (urls || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  persistGenerationTombstones();
}

const SNAPSHOT_KEY = 'drawing_history_v2';
const LEGACY_KEYS = ['drawing_all_generations', 'drawing_sessions', 'drawing_current_session_id'];
let latestSnapshot: DrawingSnapshot | undefined;
let flushedLocalSnapshot: DrawingSnapshot | undefined;
let saveDrawingTimer: ReturnType<typeof setTimeout> | null = null;

export function sanitizeTaskForStorage(task: GenerationTask): GenerationTask {
  const inputMedia = [task.referenceImageUrl, task.sourceImageUrl, task.productImageUrl, ...(task.referenceImages || []), ...(task.images || [])];
  const referenceMediaMissing = task.referenceMediaMissing || inputMedia.some(url => url && (/^(data:|blob:)/i.test(url) || url.includes('...[stripped]')));
  return { ...mapTaskMedia(task, url => /^(data:|blob:)/i.test(url) || url.includes('...[stripped]') ? undefined : url), referenceMediaMissing };
}

function sanitizeTaskForStartup(task: GenerationTask, stripMedia = true, failMissingMedia = true): GenerationTask {
  const clean = stripMedia ? sanitizeTaskForStorage(task) : task;
  // A missing local input cannot be resubmitted with the original operation ID.
  if (failMissingMedia && isImageTaskActive(clean.status) && !clean.submissionRecoveryRequired && !clean.taskId && clean.useReferenceImage
    && (clean.referenceMediaMissing || (!clean.referenceImageUrl && !clean.referenceImages?.length && !clean.images?.length && !clean.productImageUrl && !clean.sourceImageUrl))) {
    return { ...clean, status: 'FAILURE', failReason: '参考素材未恢复，请重新上传后再次生成' };
  }
  return clean;
}

function readStoredSnapshot(): DrawingSnapshot {
  let sessions: ChatSession[] = [];
  let currentId = 'session-default';
  let tasks: GenerationTask[] = [];
  let hasStoredSessions = false;
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(SNAPSHOT_KEY);
      if (saved) {
        const snapshot = JSON.parse(saved) as DrawingSnapshot;
        if (Array.isArray(snapshot.sessions) && Array.isArray(snapshot.tasks)) return snapshot;
      }
      const rawSessions = localStorage.getItem('drawing_sessions');
      const rawTasks = localStorage.getItem('drawing_all_generations');
      const savedId = localStorage.getItem('drawing_current_session_id');
      if (rawSessions) {
        const parsed = JSON.parse(rawSessions);
        if (Array.isArray(parsed)) { sessions = parsed; hasStoredSessions = true; }
      }
      if (rawTasks) {
        const parsed = JSON.parse(rawTasks);
        if (Array.isArray(parsed)) tasks = parsed;
      }
      if (savedId && sessions.some(session => session.id === savedId)) currentId = savedId;
      else if (sessions.length) currentId = sessions[0].id;
    } catch { /* preserve the last valid in-memory state */ }
  }
  if (!sessions.length && !hasStoredSessions) {
    sessions = [{ id: currentId, title: '未命名对话', createdAt: Date.now(), tasks: [] }];
  }
  return { sessions, currentId, tasks, updatedAt: 0 };
}

function storageError(message = '对话历史保存失败，请检查本地存储空间；当前内容仍保留在页面中') {
  window.dispatchEvent(new CustomEvent('beike:generation-storage-error', {
    detail: message,
  }));
}

export function flushDrawingStateToStorage() {
  if (!latestSnapshot) return;
  if (saveDrawingTimer) clearTimeout(saveDrawingTimer);
  saveDrawingTimer = null;
  const snapshot = latestSnapshot;
  const base = flushedLocalSnapshot || snapshot;
  const lightweight = mergeDrawingSnapshots(lightSnapshot(base), lightSnapshot(snapshot), readStoredSnapshot());
  let cached = false;
  try {
    // One write commits sessions, current selection and task IDs together.
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(lightweight));
    cached = true;
    flushedLocalSnapshot = snapshot;
    LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
  } catch { /* Keep the previous valid snapshot instead of trimming history. */ }
  if (hasDrawingArchive()) void saveDrawingArchive(snapshot, base).then(() => {
    if (!flushedLocalSnapshot || flushedLocalSnapshot.updatedAt < snapshot.updatedAt) flushedLocalSnapshot = snapshot;
  }).catch(() => storageError(cached
    ? '参考素材归档失败，请暂时保留当前页面，刷新后可能需要重新上传素材' : undefined));
  else if (!cached) storageError();
}

function lightSnapshot(snapshot: DrawingSnapshot): DrawingSnapshot {
  return {
    ...snapshot,
    tasks: snapshot.tasks.map(sanitizeTaskForStorage),
    sessions: snapshot.sessions.map(session => ({ ...session, tasks: session.tasks.map(sanitizeTaskForStorage) })),
  };
}

export function persistDrawingStateToStorage(
  allGens?: GenerationTask[],
  sessions?: ChatSession[],
  currentId?: string,
  options?: { force?: boolean; immediate?: boolean },
) {
  if (typeof window === 'undefined') return;
  if (!isProjectAutosaveEnabled() && !options?.force) return;
  const previous = latestSnapshot || readStoredSnapshot();
  latestSnapshot = {
    tasks: allGens ?? previous.tasks,
    sessions: sessions ?? previous.sessions,
    currentId: currentId ?? previous.currentId,
    updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
  };
  if (saveDrawingTimer) clearTimeout(saveDrawingTimer);
  if (options?.force || options?.immediate) flushDrawingStateToStorage();
  else saveDrawingTimer = setTimeout(flushDrawingStateToStorage, 150);
}

function drawingState(snapshot: DrawingSnapshot, sanitize: boolean, failMissingMedia = true) {
  const prepare = (task: GenerationTask) => sanitizeTaskForStartup(task, sanitize, failMissingMedia);
  const valid = (task: GenerationTask) => !isGenerationDeleted(task.id, task.taskId, task.resultUrl, task.dbId);
  const sessions = snapshot.sessions.map(session => ({
    ...session, tasks: (session.tasks || []).filter(valid).map(prepare),
  }));
  const map = new Map<string, GenerationTask>();
  [...snapshot.tasks, ...sessions.flatMap(session => session.tasks)].filter(valid).forEach(task => {
    const key = task.id || task.taskId;
    if (key && !map.has(key)) map.set(key, prepare(task));
  });
  const tasks = [...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const currentId = sessions.some(session => session.id === snapshot.currentId)
    ? snapshot.currentId : sessions[0]?.id || 'session-default';
  return { sessions, currentId, tasks: retainGenerationTasks(tasks, STARTUP_TASK_SUMMARY_COUNT) };
}

export function getStoredDrawingSessions() {
  loadGenerationTombstones();
  latestSnapshot = readStoredSnapshot();
  flushedLocalSnapshot = latestSnapshot;
  if (!hasDrawingArchive()) return adoptDrawingView(latestSnapshot, true);
  return drawingState(latestSnapshot, true, !hasDrawingArchive());
}

/** Hydration failures are a local view, not edits that should terminate another tab's task. */
function adoptDrawingView(snapshot: DrawingSnapshot, sanitize: boolean) {
  const prepare = (task: GenerationTask) => sanitizeTaskForStartup(task, sanitize);
  latestSnapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map(prepare),
    sessions: snapshot.sessions.map(session => ({ ...session, tasks: session.tasks.map(prepare) })),
  };
  flushedLocalSnapshot = latestSnapshot;
  return drawingState(latestSnapshot, false);
}

export async function restoreDrawingArchive() {
  const original = latestSnapshot;
  if (!original) return null;
  try {
    const archive = await readDrawingArchive(0);
    // Do not replace a new session or task created while the archive was loading.
    if (latestSnapshot !== original) return null;
    latestSnapshot = archive && archive.updatedAt >= original.updatedAt
      ? archive : archive ? restoreArchivedMedia(original, archive) : original;
    return adoptDrawingView(latestSnapshot, false);
  } catch { return adoptDrawingView(original, true); }
}

export const isDrawingHistoryReady = () => !hasDrawingArchive();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (saveDrawingTimer) flushDrawingStateToStorage(); });
}
