import type { ImageSetQueueItem } from './assetPromptConstants';

export const DECONSTRUCT_QUEUE_STORAGE_KEY = 'asset_deconstruct_queue_draft';
export const DECONSTRUCT_QUEUE_CONCURRENCY_KEY = 'asset_deconstruct_queue_concurrency';

export type DeconstructQueueDraft = {
  queue: ImageSetQueueItem[];
  currentQueueIndex: number;
  userHint: string;
  selectedVisionModel: string;
};

export function readQueueConcurrency(): number {
  try {
    const raw = localStorage.getItem(DECONSTRUCT_QUEUE_CONCURRENCY_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return n;
  } catch {
    /* ignore */
  }
  return 4;
}

export function persistQueueConcurrency(value: number) {
  try {
    localStorage.setItem(DECONSTRUCT_QUEUE_CONCURRENCY_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export function persistDeconstructQueue(draft: DeconstructQueueDraft) {
  try {
    sessionStorage.setItem(DECONSTRUCT_QUEUE_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearDeconstructQueueDraft() {
  try {
    sessionStorage.removeItem(DECONSTRUCT_QUEUE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readDeconstructQueueDraft(): DeconstructQueueDraft | null {
  try {
    const raw = sessionStorage.getItem(DECONSTRUCT_QUEUE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeconstructQueueDraft;
    if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
