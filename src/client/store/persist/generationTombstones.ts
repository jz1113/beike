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
