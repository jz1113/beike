import type { ImageSetQueueItem } from './assetPromptConstants';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';

export const DECONSTRUCT_QUEUE_STORAGE_KEY = 'asset_deconstruct_queue_draft';
export const DECONSTRUCT_QUEUE_CONCURRENCY_KEY = 'asset_deconstruct_queue_concurrency';
const receiptKey = () => `asset_deconstruct_job_receipt:${getWorkspaceSecret().slice(-16)}`;
type JobReceipt = { jobId: string; savedAt: number };
let lastReceiptVersion = 0;

function readReceipt(storage: 'local' | 'session', key: string): JobReceipt | null {
  try {
    const raw = (storage === 'local' ? localStorage : sessionStorage).getItem(key);
    if (!raw) return null;
    if (!raw.startsWith('{')) return raw.trim() && raw.length <= 160 ? { jobId: raw, savedAt: 0 } : null;
    const value = JSON.parse(raw) as Partial<JobReceipt>;
    return typeof value.jobId === 'string' && value.jobId.trim() && value.jobId.length <= 160
      && typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) && value.savedAt >= 0
      ? { jobId: value.jobId, savedAt: value.savedAt } : null;
  } catch { return null; }
}

/** Separate from large image drafts: preserve submission identity before any POST. */
export function persistDeconstructJobReceipt(jobId: string): boolean {
  const key = receiptKey();
  const local = readReceipt('local', key);
  const session = readReceipt('session', key);
  lastReceiptVersion = Math.max(Date.now(), (local?.savedAt || 0) + 1, (session?.savedAt || 0) + 1, lastReceiptVersion + 1);
  const receipt = JSON.stringify({ jobId, savedAt: lastReceiptVersion });
  try { localStorage.setItem(key, receipt); if (localStorage.getItem(key) === receipt) return true; } catch { /* try session storage */ }
  try { sessionStorage.setItem(key, receipt); return sessionStorage.getItem(key) === receipt; } catch { return false; }
}
export function readDeconstructJobReceiptState(): JobReceipt | null {
  const key = receiptKey();
  const local = readReceipt('local', key);
  const session = readReceipt('session', key);
  return (session && (!local || session.savedAt > local.savedAt) ? session : local);
}
export function readDeconstructJobReceipt(): string | null {
  return readDeconstructJobReceiptState()?.jobId || null;
}

export type DeconstructQueueDraft = {
  queue: ImageSetQueueItem[];
  currentQueueIndex: number;
  userHint: string;
  selectedVisionModel: string;
  targetCategory?: string;
  targetSubcategory?: string;
  backgroundJobId?: string;
  workspaceScope?: string;
  draftSavedAt?: number;
};

export function readQueueConcurrency(): number {
  try {
    const raw = localStorage.getItem(DECONSTRUCT_QUEUE_CONCURRENCY_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.floor(n));
  } catch {
    /* ignore */
  }
  return 1;
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
    sessionStorage.setItem(DECONSTRUCT_QUEUE_STORAGE_KEY, JSON.stringify({ ...draft,
      workspaceScope: getWorkspaceSecret().slice(-16), draftSavedAt: Math.max(Date.now(), lastReceiptVersion) }));
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
    if (parsed.workspaceScope && parsed.workspaceScope !== getWorkspaceSecret().slice(-16)) return null;
    if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
