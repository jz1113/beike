import type { PosterItem, PosterProductionSettings } from './posterTypes';

export const POSTER_BATCH_HISTORY_KEY = 'headline_poster_batch_history_v1';
export const POSTER_BATCH_HISTORY_LIMIT = 24;

export interface PosterBatchSnapshotItem extends Omit<PosterItem, 'resultUrl'> {
  resultUrl?: string;
  resultCacheKey?: string;
}

export interface PosterBatchRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  settings: PosterProductionSettings;
  items: PosterBatchSnapshotItem[];
}

function isRecord(value: unknown): value is PosterBatchRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PosterBatchRecord>;
  return typeof candidate.id === 'string'
    && Number.isFinite(candidate.createdAt)
    && Number.isFinite(candidate.updatedAt)
    && Array.isArray(candidate.items)
    && Boolean(candidate.settings);
}

export function loadPosterBatchHistory(): PosterBatchRecord[] {
  try {
    const raw = window.localStorage.getItem(POSTER_BATCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function persistPosterBatchRecord(record: PosterBatchRecord): PosterBatchRecord[] {
  try {
    const next = [record, ...loadPosterBatchHistory().filter((entry) => entry.id !== record.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, POSTER_BATCH_HISTORY_LIMIT);
    window.localStorage.setItem(POSTER_BATCH_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadPosterBatchHistory();
  }
}

export function removePosterBatchRecord(id: string): PosterBatchRecord[] {
  try {
    const next = loadPosterBatchHistory().filter((entry) => entry.id !== id);
    window.localStorage.setItem(POSTER_BATCH_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadPosterBatchHistory();
  }
}
