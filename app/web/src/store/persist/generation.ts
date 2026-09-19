import type { ChatSession, GenerationTask } from '@/types/app-store';
import { isProjectAutosaveEnabled } from '@/lib/localStoragePrefs';
import { MAX_GENERATION_TASKS_IN_MEMORY, STARTUP_TASK_SUMMARY_COUNT } from '../generationLimits';

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

function sanitizeTaskForStartup(task: GenerationTask): GenerationTask {
  const stripUrl = (url?: string) => {
    if (!url) return url;
    if (url.startsWith('data:')) return undefined;
    if (url.length > 800) return undefined;
    return url;
  };
  return {
    ...task,
    resultUrl: stripUrl(task.resultUrl),
    productImageUrl: stripUrl(task.productImageUrl),
    referenceImageUrl: stripUrl(task.referenceImageUrl),
    referenceImages: task.referenceImages?.map(stripUrl).filter(Boolean) as string[] | undefined,
    images: task.images?.map(stripUrl).filter(Boolean) as string[] | undefined,
  };
}

export function sanitizeTaskForStorage(task: GenerationTask): GenerationTask {
  const sanitizeUrl = (url?: string) => {
    if (!url) return url;
    if (url.startsWith('data:image/') && url.length > 500) {
      return url.slice(0, 80) + '...[stripped]';
    }
    return url;
  };

  return {
    ...task,
    productImageUrl: sanitizeUrl(task.productImageUrl),
    referenceImageUrl: sanitizeUrl(task.referenceImageUrl),
    referenceImages: task.referenceImages?.map(sanitizeUrl).filter(Boolean) as string[] | undefined,
    images: task.images?.map(sanitizeUrl).filter(Boolean) as string[] | undefined
  };
}

let saveDrawingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingGens: GenerationTask[] | undefined;
let pendingSessions: ChatSession[] | undefined;
let pendingCurrentId: string | undefined;

export function persistDrawingStateToStorage(
  allGens?: GenerationTask[],
  sessions?: ChatSession[],
  currentId?: string,
) {
  if (typeof window === 'undefined') return;
  if (!isProjectAutosaveEnabled()) return;
  if (allGens !== undefined) pendingGens = allGens;
  if (sessions !== undefined) pendingSessions = sessions;
  if (currentId !== undefined) pendingCurrentId = currentId;
  if (saveDrawingTimer) clearTimeout(saveDrawingTimer);
  saveDrawingTimer = setTimeout(() => {
    const gens = pendingGens;
    const nextSessions = pendingSessions;
    const id = pendingCurrentId;
    pendingGens = undefined;
    pendingSessions = undefined;
    pendingCurrentId = undefined;
    try {
      if (gens !== undefined) {
        const lightweightGens = gens.slice(0, 100).map(sanitizeTaskForStorage);
        localStorage.setItem('drawing_all_generations', JSON.stringify(lightweightGens));
      }
      if (nextSessions !== undefined) {
        const lightweightSessions = nextSessions.slice(0, 25).map(s => ({
          ...s,
          tasks: (s.tasks || []).slice(0, 30).map(sanitizeTaskForStorage)
        }));
        localStorage.setItem('drawing_sessions', JSON.stringify(lightweightSessions));
      }
      if (id !== undefined) {
        localStorage.setItem('drawing_current_session_id', id);
      }
    } catch (e: unknown) {
      const err = e as { name?: string; code?: number };
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        try {
          localStorage.removeItem('drawing_all_generations');
          if (nextSessions) {
            localStorage.setItem('drawing_sessions', JSON.stringify(nextSessions.slice(0, 5).map(s => ({
              ...s,
              tasks: (s.tasks || []).slice(0, 10).map(sanitizeTaskForStorage)
            }))));
          }
        } catch {}
      }
    }
  }, 150);
}

export const getStoredDrawingSessions = () => {
  loadGenerationTombstones();

  let sessions: ChatSession[] = [];
  let currentId = 'session-default';
  let allGenerations: GenerationTask[] = [];

  if (typeof window !== 'undefined') {
    try {
      const savedSessions = localStorage.getItem('drawing_sessions');
      const savedId = localStorage.getItem('drawing_current_session_id');
      const savedAll = localStorage.getItem('drawing_all_generations');
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sessions = parsed.map((s: ChatSession) => ({
            ...s,
            tasks: (s.tasks || []).slice(0, 30).map(sanitizeTaskForStartup),
          }));
          currentId = (savedId && savedId !== '__all__' && parsed.some((s: { id: string }) => s.id === savedId)) ? savedId : parsed[0].id;
        }
      }
      if (savedAll) {
        const parsedAll = JSON.parse(savedAll);
        if (Array.isArray(parsedAll)) {
          allGenerations = parsedAll.map(sanitizeTaskForStartup);
        }
      }
    } catch {}
  }

  if (sessions.length === 0) {
    const defaultId = 'session-default';
    sessions = [
      {
        id: defaultId,
        title: '未命名对话',
        createdAt: Date.now(),
        tasks: []
      }
    ];
    currentId = defaultId;
  }

  const map = new Map<string, GenerationTask>();
  allGenerations.forEach(t => {
    const key = t.id || t.taskId;
    if (key) map.set(key, t);
  });
  sessions.forEach(s => {
    (s.tasks || []).forEach(t => {
      const key = t.id || t.taskId;
      if (key && !map.has(key)) map.set(key, t);
    });
  });

  const mergedGenerations = Array.from(map.values())
    .filter((t) => !isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId))
    .sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    })
    .slice(0, Math.min(STARTUP_TASK_SUMMARY_COUNT, MAX_GENERATION_TASKS_IN_MEMORY));

  return {
    sessions,
    currentId,
    tasks: mergedGenerations
  };
};
